import type { Context } from 'hono';
import type { ChatService } from '../chat-provider';
import type { ConnectOutcome } from './google-connect.service';

import { zValidator } from '@hono/zod-validator';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import { type AppLogger, getAppLogger } from '../../logger';
import { BaseRouter } from '../../routers';
import { CHAT_SERVICE } from '../../tokens';

import { GoogleConnectService } from './google-connect.service';

const INVALID_LINK_TEXT = 'Link expired or already used. Send /connect again.';
const CANCELLED_TELEGRAM_TEXT = 'Google connection was cancelled.';
const CANCELLED_PAGE_TEXT = 'Cancelled, return to Telegram.';
const ERROR_PAGE_TEXT = 'Something went wrong. Send /connect to try again.';
const CONNECTED_PAGE_TEXT = 'Connected, return to Telegram.';

const CallbackQuerySchema = z.object({
    state: z.string().min(1),
    code: z.string().optional(),
    error: z.string().optional(),
});

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function page(text: string): string {
    return `<!doctype html><meta charset="utf-8"><title>Tempo</title><p>${escapeHtml(text)}</p>`;
}

@injectable()
export class GoogleOAuthRouter extends BaseRouter {
    private readonly logger: AppLogger = getAppLogger(GoogleOAuthRouter.name);

    constructor(
        private readonly connectService: GoogleConnectService,
        @inject(CHAT_SERVICE) private readonly chatService: ChatService
    ) {
        super('/oauth/google');
        this.setupRoutes();
    }

    protected setupRoutes(): void {
        this.app.get(
            '/callback',
            zValidator('query', CallbackQuerySchema, (result, c) => {
                if (!result.success) {
                    return c.html(page(INVALID_LINK_TEXT), 400);
                }
            }),
            async (c) => this.handleCallback(c, c.req.valid('query'))
        );
    }

    private async handleCallback(c: Context, query: z.infer<typeof CallbackQuerySchema>): Promise<Response> {
        let outcome: ConnectOutcome;
        try {
            outcome = await this.connectService.complete(query);
        } catch (error) {
            this.logger.error(error, 'Failed to complete Google connect callback');
            return c.html(page(ERROR_PAGE_TEXT), 500);
        }

        if (outcome.kind === 'invalid') {
            return c.html(page(INVALID_LINK_TEXT), 400);
        }

        const { pageText, telegramText } = this.describe(outcome);
        await this.notify(outcome, telegramText);

        return c.html(page(pageText));
    }

    private describe(outcome: Exclude<ConnectOutcome, { kind: 'invalid' }>): {
        pageText: string;
        telegramText: string;
    } {
        switch (outcome.kind) {
            case 'denied':
                return { pageText: CANCELLED_PAGE_TEXT, telegramText: CANCELLED_TELEGRAM_TEXT };
            case 'failed': {
                const text = `${outcome.message} Send /connect to try again.`;
                return { pageText: text, telegramText: text };
            }
            case 'connected': {
                const missing =
                    outcome.missingScopes.length > 0
                        ? ` Missing permissions: ${outcome.missingScopes.join(', ')}.`
                        : '';
                return {
                    pageText: CONNECTED_PAGE_TEXT,
                    telegramText: `Connected Google as ${outcome.googleEmail}.${missing}`,
                };
            }
        }
    }

    private async notify(
        { userId, chatId }: Exclude<ConnectOutcome, { kind: 'invalid' }>,
        text: string
    ): Promise<void> {
        try {
            await this.chatService.sendMessage(chatId, text);
        } catch (error) {
            this.logger.error({ err: error, userId, chatId }, 'Failed to notify chat about Google connect result');
        }
    }
}
