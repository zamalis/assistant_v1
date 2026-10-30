import type { Env } from '../../../schemas';
import type { IncomingMessageHandler, SendMessageOptions } from '../chat-provider.schema';

import { Bot, type Context } from 'grammy';
import { User as TelegramUser } from 'grammy/types';
import { inject, injectable } from 'tsyringe';

import { User } from '../../../entities';
import { type AppLogger, getAppLogger } from '../../../logger';
import { ENV } from '../../../tokens';
import { ChatService } from '../chat.service';
import { parseIncomingText } from '../parse-incoming-text';

import { markdownToTelegramHtml } from './telegram-markdown';

const TELEGRAM_REPLY_MAX_LENGTH = 4096;
const HTML_OPTIONS = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } as const;

type PrivateUserContext = Context & {
    chat: TelegramUser;
    from: TelegramUser;
};

@injectable()
export class TelegramService extends ChatService<Bot> {
    private readonly logger: AppLogger = getAppLogger(TelegramService.name);

    constructor(@inject(ENV) env: Env) {
        super(env);
    }

    protected createClient(): Bot {
        const bot = new Bot(this.env.TELEGRAM_BOT_TOKEN);
        bot.catch((error) => {
            this.logger.error(error, 'Telegram bot error');
        });
        return bot;
    }

    public start(onMessage: IncomingMessageHandler): Promise<void> {
        this.client.on('message:text', async (ctx) => {
            if (!this.isPrivateUserMessage(ctx)) {
                return;
            }
            const text = ctx.message.text.trim();
            if (!text) {
                return;
            }
            await onMessage({
                providerUserId: String(ctx.from.id),
                chatId: String(ctx.chat.id),
                ...parseIncomingText(text),
            });
        });

        return new Promise((resolve, reject) => {
            this.client.start({ onStart: () => resolve() }).catch((error: unknown) => {
                this.logger.error(error, 'Failed to start Telegram polling');
                reject(error);
            });
        });
    }

    public async stop(): Promise<void> {
        if (!this.client.isRunning()) {
            return;
        }

        try {
            await this.client.stop();
        } catch (error) {
            this.logger.error(error, 'Failed to stop Telegram polling');
            throw error;
        }
    }

    public async sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<void> {
        try {
            if (options?.format === 'markdown') {
                for (const chunk of markdownToTelegramHtml(text, TELEGRAM_REPLY_MAX_LENGTH)) {
                    await this.client.api.sendMessage(chatId, chunk, HTML_OPTIONS);
                }
            } else if (options?.format === 'html') {
                await this.client.api.sendMessage(chatId, text, HTML_OPTIONS);
            } else {
                await this.client.api.sendMessage(chatId, text.slice(0, TELEGRAM_REPLY_MAX_LENGTH));
            }
        } catch (error) {
            // grammy errors carry the request payload (the message text), so log only the API's verdict.
            const { error_code: errorCode, description } = (error ?? {}) as {
                error_code?: number;
                description?: string;
            };
            const reason = description ?? (error instanceof Error ? error.message : String(error));
            this.logger.error({ chatId, errorCode, reason }, 'Failed to send Telegram message');
            throw new Error(`Telegram sendMessage failed (${errorCode ?? 'no code'}): ${reason}`);
        }
    }

    protected getProviderUserIdField(): keyof User {
        return 'telegramId';
    }

    private isPrivateUserMessage(ctx: Context): ctx is PrivateUserContext {
        return ctx.chat?.type === 'private' && ctx.from != null;
    }
}
