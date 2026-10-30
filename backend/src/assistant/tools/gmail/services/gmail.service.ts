import type { gmail_v1 } from '@googleapis/gmail';
import type { User } from '../../../../common/entities';
import type { CreatedDraft, MessageDetail, MessageSummary } from './gmail.types';

import { injectable } from 'tsyringe';

import { NotFoundError } from '../../../../common/errors';
import { GMAIL_COMPOSE_SCOPE, GMAIL_READ_SCOPE, GoogleAuthService } from '../../../../common/integrations';
import { type AppLogger, getAppLogger } from '../../../../common/logger';
import { extractBody } from '../utils';

import { GmailApiFactory } from './gmail-api.factory';

const READ_SCOPES = [GMAIL_READ_SCOPE];
const COMPOSE_SCOPES = [GMAIL_READ_SCOPE, GMAIL_COMPOSE_SCOPE];
const SNIPPET_MAX_LENGTH = 200;
const DEFAULT_MAX_BODY_CHARS = 8000;
const THREAD_MAX_MESSAGES = 10;
const SUMMARY_HEADERS = ['From', 'To', 'Subject', 'Date'];

type Target = { kind: 'Message' | 'Draft' | 'Thread'; id?: string };

function headerValue(message: gmail_v1.Schema$Message, name: string): string {
    const lower = name.toLowerCase();
    return message.payload?.headers?.find((h) => h.name?.toLowerCase() === lower)?.value ?? '';
}

function errorStatus(error: unknown): number | undefined {
    const candidate = error as { response?: { status?: unknown }; status?: unknown; code?: unknown } | null;
    const status = candidate?.response?.status ?? candidate?.status ?? candidate?.code;
    return typeof status === 'number' ? status : undefined;
}

@injectable()
export class GmailService {
    private readonly logger: AppLogger = getAppLogger(GmailService.name);

    constructor(
        private readonly googleAuth: GoogleAuthService,
        private readonly apiFactory: GmailApiFactory
    ) {}

    async search(user: User, query: string, maxResults: number): Promise<MessageSummary[]> {
        return this.call(user, READ_SCOPES, {}, async (api) => {
            const list = await api.users.messages.list({ userId: 'me', q: query, maxResults });
            const ids = (list.data.messages ?? []).flatMap((m) => (m.id ? [m.id] : []));
            return Promise.all(
                ids.map(async (id) => {
                    const { data } = await api.users.messages.get({
                        userId: 'me',
                        id,
                        format: 'metadata',
                        metadataHeaders: SUMMARY_HEADERS,
                    });
                    return this.toSummary(data);
                })
            );
        });
    }

    async getMessage(user: User, messageId: string, maxBodyChars = DEFAULT_MAX_BODY_CHARS): Promise<MessageDetail> {
        return this.call(user, READ_SCOPES, { kind: 'Message', id: messageId }, async (api) => {
            const { data } = await api.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
            return this.toDetail(data, maxBodyChars);
        });
    }

    async getThread(user: User, threadId: string, maxBodyChars = DEFAULT_MAX_BODY_CHARS): Promise<MessageDetail[]> {
        return this.call(user, READ_SCOPES, { kind: 'Thread', id: threadId }, async (api) => {
            const { data } = await api.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
            return (data.messages ?? []).slice(-THREAD_MAX_MESSAGES).map((m) => this.toDetail(m, maxBodyChars));
        });
    }

    async createDraft(user: User, raw: string, threadId?: string): Promise<CreatedDraft> {
        return this.call(user, COMPOSE_SCOPES, { kind: 'Draft' }, async (api) => {
            const { data } = await api.users.drafts.create({
                userId: 'me',
                requestBody: { message: { raw, threadId } },
            });
            if (!data.id || !data.message?.id) {
                throw new Error('Gmail returned a draft without ids');
            }
            return { draftId: data.id, messageId: data.message.id };
        });
    }

    async deleteDraft(user: User, draftId: string): Promise<void> {
        try {
            await this.call(user, COMPOSE_SCOPES, { kind: 'Draft', id: draftId }, async (api) => {
                await api.users.drafts.delete({ userId: 'me', id: draftId });
            });
        } catch (error) {
            if (!(error instanceof NotFoundError)) {
                throw error;
            }
        }
    }

    async sendDraft(user: User, draftId: string): Promise<void> {
        await this.call(user, COMPOSE_SCOPES, { kind: 'Draft', id: draftId }, async (api) => {
            await api.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
        });
    }

    async hasCorrespondedWith(user: User, address: string): Promise<boolean> {
        return this.call(user, READ_SCOPES, {}, async (api) => {
            const list = await api.users.messages.list({
                userId: 'me',
                q: `in:sent (to:"${address}" OR cc:"${address}" OR bcc:"${address}")`,
                maxResults: 1,
            });
            return (list.data.messages ?? []).length > 0;
        });
    }

    private async call<T>(
        user: User,
        scopes: readonly string[],
        target: Partial<Target>,
        run: (api: gmail_v1.Gmail) => Promise<T>
    ): Promise<T> {
        const auth = await this.googleAuth.getClient(user, scopes);
        const api = this.apiFactory.create(auth);
        try {
            return await run(api);
        } catch (error) {
            throw this.mapError(error, user, target);
        }
    }

    private mapError(error: unknown, user: User, target: Partial<Target>): unknown {
        const status = errorStatus(error);
        if (status === undefined) {
            // Network errors carry the request (URL, MIME body) just like HTTP ones, so only the message crosses.
            return new Error(error instanceof Error ? error.message : String(error));
        }
        this.logger.warn({ userId: user.id, id: target.id, status }, 'Gmail request failed');

        if (status === 404 && target.kind) {
            return new NotFoundError(`${target.kind} ${target.id} not found`);
        }
        if (status === 429 || status >= 500) {
            return new Error(`Gmail is temporarily unavailable (${status})`);
        }
        return new Error(error instanceof Error ? error.message : `Gmail request failed (${status})`);
    }

    private toSummary(message: gmail_v1.Schema$Message): MessageSummary {
        return {
            id: message.id ?? '',
            threadId: message.threadId ?? '',
            from: headerValue(message, 'From'),
            to: headerValue(message, 'To'),
            subject: headerValue(message, 'Subject'),
            date: headerValue(message, 'Date'),
            snippet: (message.snippet ?? '').slice(0, SNIPPET_MAX_LENGTH),
            unread: message.labelIds?.includes('UNREAD') ?? false,
        };
    }

    private toDetail(message: gmail_v1.Schema$Message, maxBodyChars: number): MessageDetail {
        const { text, truncated } = extractBody(message.payload, maxBodyChars);
        return {
            ...this.toSummary(message),
            cc: headerValue(message, 'Cc'),
            replyTo: headerValue(message, 'Reply-To'),
            messageIdHeader: headerValue(message, 'Message-ID'),
            references: headerValue(message, 'References'),
            body: text,
            truncated,
        };
    }
}
