import type { ChatService } from '../../../integrations';
import type { ConnectOutcome, GoogleConnectService } from '../../../integrations/google';

import { container } from 'tsyringe';

import { GoogleOAuthRouter } from '../../../integrations/google';
import { createLogger } from '../../../logger';
import { LOGGER } from '../../../tokens';
import { createTestEnv } from '../../test-env';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const EXPIRED_PAGE = 'Link expired or already used. Send /connect again.';

describe('GoogleOAuthRouter', () => {
    let connectService: { complete: ReturnType<typeof mock> };
    let chatService: { sendMessage: ReturnType<typeof mock> };
    let router: GoogleOAuthRouter;

    const call = (query = '?state=s1&code=c1') => router.getApp().request(`/callback${query}`);
    const outcome = (value: ConnectOutcome) => connectService.complete.mockImplementation(async () => value);

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(createTestEnv()));
        connectService = { complete: mock(async () => ({ kind: 'invalid' }) as ConnectOutcome) };
        chatService = { sendMessage: mock(async () => undefined) };
        router = new GoogleOAuthRouter(
            connectService as unknown as GoogleConnectService,
            chatService as unknown as ChatService
        );
    });

    it('mounts under /oauth/google', () => {
        expect(router.getPath()).toBe('/oauth/google');
    });

    it('notifies Telegram and renders the success page when connected', async () => {
        outcome({ kind: 'connected', userId: 'u1', chatId: '42', googleEmail: 'me@gmail.com', missingScopes: [] });

        const res = await call();

        expect(res.status).toBe(200);
        expect(await res.text()).toContain('Connected, return to Telegram.');
        expect(connectService.complete).toHaveBeenCalledWith({ state: 's1', code: 'c1', error: undefined });
        expect(chatService.sendMessage).toHaveBeenCalledWith('42', 'Connected Google as me@gmail.com.');
    });

    it('lists missing permissions in the Telegram message', async () => {
        outcome({ kind: 'connected', userId: 'u1', chatId: '42', googleEmail: 'me@gmail.com', missingScopes: ['s1'] });

        await call();

        expect(chatService.sendMessage).toHaveBeenCalledWith(
            '42',
            'Connected Google as me@gmail.com. Missing permissions: s1.'
        );
    });

    it('reports a cancelled consent', async () => {
        outcome({ kind: 'denied', userId: 'u1', chatId: '42' });

        const res = await call('?state=s1&error=access_denied');

        expect(await res.text()).toContain('Cancelled, return to Telegram.');
        expect(chatService.sendMessage).toHaveBeenCalledWith('42', 'Google connection was cancelled.');
    });

    it('reports a failure on both the page and Telegram', async () => {
        outcome({ kind: 'failed', userId: 'u1', chatId: '42', message: 'Boom.' });

        const res = await call();

        expect(await res.text()).toContain('Boom. Send /connect to try again.');
        expect(chatService.sendMessage).toHaveBeenCalledWith('42', 'Boom. Send /connect to try again.');
    });

    it('answers 400 and stays silent in Telegram for an invalid link', async () => {
        outcome({ kind: 'invalid' });

        const res = await call();

        expect(res.status).toBe(400);
        expect(await res.text()).toContain(EXPIRED_PAGE);
        expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it('answers 400 without calling the service when state is missing', async () => {
        const res = await call('');

        expect(res.status).toBe(400);
        expect(await res.text()).toContain(EXPIRED_PAGE);
        expect(connectService.complete).not.toHaveBeenCalled();
    });

    it('still renders the success page when the Telegram message cannot be sent', async () => {
        outcome({ kind: 'connected', userId: 'u1', chatId: '42', googleEmail: 'me@gmail.com', missingScopes: [] });
        chatService.sendMessage.mockImplementation(async () => {
            throw new Error('chat down');
        });

        const res = await call();

        expect(res.status).toBe(200);
        expect(await res.text()).toContain('Connected, return to Telegram.');
    });

    it('renders an html failure page when completing the callback throws', async () => {
        connectService.complete.mockImplementation(async () => {
            throw new Error('db down');
        });

        const res = await call();

        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).toContain('text/html');
        expect(await res.text()).toContain('Something went wrong. Send /connect to try again.');
        expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it('escapes html in the failure message on the page', async () => {
        outcome({ kind: 'failed', userId: 'u1', chatId: '42', message: '<b>bad</b>' });

        const body = await (await call()).text();

        expect(body).toContain('&lt;b&gt;');
        expect(body).not.toContain('<b>bad');
    });
});
