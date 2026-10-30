import { container } from 'tsyringe';

import { TelegramService } from '../../../common/integrations';
import { createLogger } from '../../../common/logger';
import { createTestEnv } from '../../../common/tests/test-env';
import { LOGGER } from '../../../common/tokens';

import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

const TELEGRAM_REPLY_MAX_LENGTH = 4096;

type TelegramHarness = {
    createClient(): unknown;
};

describe('TelegramService', () => {
    const env = createTestEnv({ OPENAI_API_KEY: 'sk-test', TELEGRAM_BOT_TOKEN: '123:abc' });
    let apiSendMessage: ReturnType<typeof mock>;
    let service: TelegramService;

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(env));
        apiSendMessage = mock(() => Promise.resolve());
        spyOn(TelegramService.prototype as unknown as TelegramHarness, 'createClient').mockReturnValue({
            api: { sendMessage: apiSendMessage },
        });
        service = new TelegramService(env);
    });

    it('sends the message to the given chat', async () => {
        await service.sendMessage('42', 'pong');

        expect(apiSendMessage).toHaveBeenCalledWith('42', 'pong');
    });

    it('truncates a message that exceeds the Telegram limit', async () => {
        const text = 'x'.repeat(TELEGRAM_REPLY_MAX_LENGTH + 20);

        await service.sendMessage('42', text);

        expect(apiSendMessage).toHaveBeenCalledWith('42', text.slice(0, TELEGRAM_REPLY_MAX_LENGTH));
    });

    it('sends html with parse_mode HTML and no truncation', async () => {
        const text = '<b>x</b>'.repeat(625);

        await service.sendMessage('42', text, { format: 'html' });

        expect(text.length).toBeGreaterThan(TELEGRAM_REPLY_MAX_LENGTH);
        expect(apiSendMessage).toHaveBeenCalledWith('42', text, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
        });
    });

    it('converts markdown to HTML without link previews', async () => {
        await service.sendMessage('42', '**Hi** <you>', { format: 'markdown' });

        expect(apiSendMessage).toHaveBeenCalledWith('42', '<b>Hi</b> &lt;you&gt;', {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
        });
    });

    it('splits long markdown into several messages instead of truncating', async () => {
        const text = Array.from({ length: 100 }, (_, i) => `- item ${i} ${'x'.repeat(80)}`).join('\n');

        await service.sendMessage('42', text, { format: 'markdown' });

        const sent = apiSendMessage.mock.calls.map(([, chunk]) => chunk as string);
        expect(sent.length).toBeGreaterThan(1);
        expect(sent.every((chunk) => chunk.length <= TELEGRAM_REPLY_MAX_LENGTH)).toBe(true);
        expect(sent.join('\n')).toContain('• item 99');
    });

    it('keeps plain text unchanged when the format is plain', async () => {
        const text = 'x'.repeat(TELEGRAM_REPLY_MAX_LENGTH + 20);

        await service.sendMessage('42', text, { format: 'plain' });

        expect(apiSendMessage).toHaveBeenCalledWith('42', text.slice(0, TELEGRAM_REPLY_MAX_LENGTH));
    });

    it('logs and rethrows only the error code and description when a send fails, never the message text', async () => {
        const failure = Object.assign(new Error('Call failed'), {
            error_code: 400,
            description: "Bad Request: can't parse entities",
            payload: { text: 'secret body' },
        });
        apiSendMessage.mockImplementation(() => Promise.reject(failure));
        const logger = (service as unknown as { logger: { error(...args: unknown[]): void } }).logger;
        const logError = spyOn(logger, 'error').mockImplementation(() => undefined);

        const thrown = await service
            .sendMessage('42', 'secret body', { format: 'html' })
            .catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(Error);
        expect(thrown).not.toBe(failure);
        expect(thrown).not.toHaveProperty('payload');
        expect((thrown as Error).message).toContain("can't parse entities");
        expect((thrown as Error).message).toContain('400');

        expect(JSON.stringify(logError.mock.calls)).not.toContain('secret body');
        expect(JSON.stringify(logError.mock.calls)).toContain("can't parse entities");
    });

    it('filters allowed users by their Telegram id', () => {
        expect(service.getAllowedUserFilter('7')).toEqual({ isAllowed: true, telegramId: '7' });
    });
});
