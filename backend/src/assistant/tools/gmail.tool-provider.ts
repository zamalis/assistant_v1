import type { StructuredToolInterface } from '@langchain/core/tools';
import type { z } from 'zod';

import { injectable } from 'tsyringe';

import { defineTool, type ToolContext, type ToolProvider } from '../../common/integrations';
import { type AppLogger, getAppLogger } from '../../common/logger';
import { GmailPendingSendRepository } from '../repositories';
import {
    GMAIL_MAX_RECIPIENTS,
    type GmailCreateDraftArgs,
    GmailCreateDraftSchema,
    GmailReadSchema,
    GmailSearchSchema,
} from '../schemas';

import {
    buildDraftPreview,
    buildMime,
    type DraftPreviewInput,
    GmailService,
    type MessageDetail,
    type MessageSummary,
    type MimeInput,
    parseAddresses,
    type RecipientCheck,
    replySubject,
} from './gmail';

const THREAD_TOTAL_BODY_CHARS = 24_000;
const PENDING_SEND_TTL_MS = 60 * 60 * 1000;
const DRAFT_CREATED_TEXT = 'Draft created. A preview was shown to the user; they send it with /send.';
const NO_MESSAGES_TEXT = 'No messages found.';

type Digest = z.core.util.JSONType;

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function wrapUntrusted(content: string): string {
    const safe = content.replace(/<\/email_data/gi, '<\\/email_data');
    return `<email_data untrusted="true">\n${safe}\n</email_data>`;
}

function formatMessage(message: MessageDetail): string {
    const lines = [
        `Id: ${message.id}`,
        `Thread: ${message.threadId}`,
        `From: ${message.from}`,
        `To: ${message.to}`,
        message.cc ? `Cc: ${message.cc}` : null,
        `Date: ${message.date}`,
        `Subject: ${message.subject}`,
        '',
        message.body,
    ];
    return lines.filter((line) => line !== null).join('\n');
}

/** Stored digests are replayed into later turns outside the untrusted wrapper, so they carry no subject, snippet or body. */
function toDigest(message: MessageSummary): Digest {
    return {
        id: message.id,
        threadId: message.threadId,
        from: parseAddresses(message.from)[0] ?? '',
        date: message.date,
    };
}

/** Keeps the newest messages, cutting the oldest kept one so the combined bodies stay within the budget. */
function trimThread(messages: MessageDetail[]): MessageDetail[] {
    const kept: MessageDetail[] = [];
    let remaining = THREAD_TOTAL_BODY_CHARS;
    for (const message of [...messages].reverse()) {
        if (remaining <= 0) {
            break;
        }
        if (message.body.length > remaining) {
            kept.push({ ...message, body: `${message.body.slice(0, remaining)} (truncated)`, truncated: true });
            break;
        }
        kept.push(message);
        remaining -= message.body.length;
    }
    return kept.reverse();
}

@injectable()
export class GmailToolProvider implements ToolProvider {
    private readonly logger: AppLogger = getAppLogger(GmailToolProvider.name);

    constructor(
        private readonly gmailService: GmailService,
        private readonly pendingSendRepository: GmailPendingSendRepository
    ) {}

    getTools(ctx: ToolContext): StructuredToolInterface[] {
        return [this.searchTool(ctx), this.readTool(ctx), this.createDraftTool(ctx)];
    }

    private searchTool({ user }: ToolContext): StructuredToolInterface {
        // run() and digest() receive the same args object, so it keys the data the digest needs.
        const digests = new WeakMap<object, Digest>();
        return defineTool({
            name: 'gmail_search',
            description:
                "Search the user's Gmail with Gmail search syntax. Returns message ids, senders, subjects, dates and snippets.",
            schema: GmailSearchSchema,
            run: async (args) => {
                const messages = await this.gmailService.search(user, args.query, args.maxResults);
                digests.set(args, messages.map(toDigest));
                return messages.length === 0 ? NO_MESSAGES_TEXT : wrapUntrusted(JSON.stringify(messages));
            },
            digest: (args) => digests.get(args) ?? null,
        });
    }

    private readTool({ user }: ToolContext): StructuredToolInterface {
        const digests = new WeakMap<object, Digest>();
        return defineTool({
            name: 'gmail_read',
            description:
                'Read one email by message id (use gmail_search to find ids). Set includeThread to also read the earlier messages of its thread.',
            schema: GmailReadSchema,
            run: async (args) => {
                const message = await this.gmailService.getMessage(user, args.messageId);
                const messages = args.includeThread
                    ? trimThread(await this.gmailService.getThread(user, message.threadId))
                    : [message];
                digests.set(args, messages.map(toDigest));
                return messages.map((m) => wrapUntrusted(formatMessage(m))).join('\n\n');
            },
            digest: (args) => digests.get(args) ?? null,
        });
    }

    private createDraftTool({ user, now, outbox }: ToolContext): StructuredToolInterface {
        const digests = new WeakMap<object, Digest>();
        return defineTool({
            name: 'gmail_create_draft',
            description:
                'Create a Gmail draft, either a reply (replyToMessageId, optional cc) or a new email (to, optional cc, subject). The user reviews a preview and sends it themselves with /send; you cannot send.',
            schema: GmailCreateDraftSchema,
            run: async (args) => {
                const { mime, preview, threadId } = await this.composeDraft(user, args);
                const { draftId } = await this.gmailService.createDraft(user, await buildMime(mime), threadId);

                const recipients = [...mime.to, ...mime.cc];
                await this.savePending(user.id, draftId, recipients, now);

                const checks = await this.checkRecipients(user, recipients);
                outbox.push({
                    text: buildDraftPreview(preview, checks),
                    format: 'html',
                    onDelivered: async () => {
                        await this.pendingSendRepository.update(
                            { userId: user.id, draftId },
                            { previewedAt: new Date() }
                        );
                    },
                });

                // A reply's subject is copied from the original email, so only new-email subjects are stored.
                digests.set(
                    args,
                    args.replyToMessageId
                        ? { draftId, to: mime.to, replyToMessageId: args.replyToMessageId }
                        : { draftId, to: mime.to, subject: mime.subject }
                );
                return DRAFT_CREATED_TEXT;
            },
            digest: (args) => digests.get(args) ?? null,
        });
    }

    private async composeDraft(
        user: ToolContext['user'],
        args: GmailCreateDraftArgs
    ): Promise<{ mime: MimeInput; preview: DraftPreviewInput; threadId?: string }> {
        const cc = args.cc ?? [];
        if (!args.replyToMessageId) {
            const to = args.to ?? [];
            const subject = args.subject ?? '';
            return { mime: { to, cc, subject, body: args.body }, preview: { to, cc, subject, body: args.body } };
        }

        const original = await this.gmailService.getMessage(user, args.replyToMessageId);
        const to = parseAddresses(original.replyTo || original.from);
        if (to.length === 0) {
            throw new Error(`Message ${original.id} has no address to reply to`);
        }
        if (to.length > GMAIL_MAX_RECIPIENTS) {
            throw new Error(`Message ${original.id} would be replied to more than ${GMAIL_MAX_RECIPIENTS} recipients`);
        }
        const subject = replySubject(original.subject);
        const mime: MimeInput = {
            to,
            cc,
            subject,
            body: args.body,
            inReplyTo: original.messageIdHeader || undefined,
            references: [original.references, original.messageIdHeader].filter(Boolean).join(' ') || undefined,
        };
        const preview: DraftPreviewInput = {
            to,
            cc,
            subject,
            body: args.body,
            inReplyTo: { subject: original.subject, from: original.from, date: original.date },
        };
        return { mime, preview, threadId: original.threadId };
    }

    private async savePending(userId: string, draftId: string, recipients: string[], now: Date): Promise<void> {
        const user = { id: userId } as ToolContext['user'];
        const existing = await this.pendingSendRepository.findOneBy({ userId });
        if (existing && existing.draftId !== draftId) {
            await this.gmailService.deleteDraft(user, existing.draftId).catch((error: unknown) => {
                this.logger.warn(
                    { userId, draftId: existing.draftId, reason: describeError(error) },
                    'Could not delete the older draft'
                );
            });
        }

        try {
            await this.pendingSendRepository.upsert(
                {
                    userId,
                    draftId,
                    recipients,
                    previewedAt: null,
                    expiresAt: new Date(now.getTime() + PENDING_SEND_TTL_MS),
                },
                ['userId']
            );
        } catch (error) {
            this.logger.error({ userId, draftId, reason: describeError(error) }, 'Could not save the pending send');
            await this.gmailService.deleteDraft(user, draftId).catch((cleanupError: unknown) => {
                this.logger.warn(
                    { userId, draftId, reason: describeError(cleanupError) },
                    'Could not delete the orphaned draft'
                );
            });
            // TypeORM errors carry the query parameters (recipients), so only the message is rethrown.
            throw new Error(describeError(error));
        }
    }

    private checkRecipients(user: ToolContext['user'], recipients: string[]): Promise<RecipientCheck[]> {
        return Promise.all(
            [...new Set(recipients)].map(async (address): Promise<RecipientCheck> => {
                try {
                    const known = await this.gmailService.hasCorrespondedWith(user, address);
                    return { address, status: known ? 'known' : 'first_time' };
                } catch (error) {
                    this.logger.warn(
                        { userId: user.id, reason: describeError(error) },
                        'Could not check recipient history'
                    );
                    return { address, status: 'unknown' };
                }
            })
        );
    }
}
