import type { GoogleCredentialRepository, OAuthPendingConsentRepository, UserRepository } from '../../../repositories';
import type { Env } from '../../../schemas';

import { OAuth2Client } from 'google-auth-library';
import { container } from 'tsyringe';
import { FindOperator } from 'typeorm';

import { ErrorMessage } from '../../../enums';
import { GoogleConnectService, type GoogleOAuthClientFactory } from '../../../integrations/google';
import { createLogger } from '../../../logger';
import { LOGGER } from '../../../tokens';
import { createTestEnv } from '../../test-env';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const CALLBACK = 'https://t.example/oauth/google/callback';
const KEY = Buffer.alloc(32, 1).toString('base64');
const FULL_SCOPE = 'openid https://www.googleapis.com/auth/userinfo.email';
const USER = { id: 'u1', name: 'alice' } as never;

describe('GoogleConnectService', () => {
    let env: Env;
    let consentConfigured: boolean;
    let fakeClient: { getToken: ReturnType<typeof mock>; verifyIdToken: ReturnType<typeof mock> };
    let factory: {
        isConsentConfigured: ReturnType<typeof mock>;
        callbackUrl: ReturnType<typeof mock>;
        clientId: ReturnType<typeof mock>;
        create: ReturnType<typeof mock>;
    };
    let consents: {
        delete: ReturnType<typeof mock>;
        create: ReturnType<typeof mock>;
        save: ReturnType<typeof mock>;
        consumeValid: ReturnType<typeof mock>;
    };
    let credentials: {
        findOneBy: ReturnType<typeof mock>;
        create: ReturnType<typeof mock>;
        save: ReturnType<typeof mock>;
    };
    let users: { findOneBy: ReturnType<typeof mock> };
    let service: GoogleConnectService;

    const consumed = { id: 'p1', userId: 'u1', codeVerifier: 'verifier', chatId: '42' };

    beforeEach(() => {
        env = createTestEnv({
            GOOGLE_CLIENT_ID: 'cid',
            GOOGLE_CLIENT_SECRET: 'secret',
            TOKEN_ENCRYPTION_KEY: KEY,
            PUBLIC_BASE_URL: 'https://t.example',
        });
        container.registerInstance(LOGGER, createLogger(env));
        consentConfigured = true;
        fakeClient = {
            getToken: mock(async () => ({
                tokens: { refresh_token: 'rt', id_token: 'idt', scope: FULL_SCOPE },
            })),
            verifyIdToken: mock(async () => ({ getPayload: () => ({ email: 'me@gmail.com' }) })),
        };
        factory = {
            isConsentConfigured: mock(() => consentConfigured),
            callbackUrl: mock(() => CALLBACK),
            clientId: mock(() => 'cid'),
            create: mock(() => fakeClient),
        };
        consents = {
            delete: mock(async () => ({})),
            create: mock((value: unknown) => value),
            save: mock(async (value: unknown) => value),
            consumeValid: mock(async () => consumed),
        };
        credentials = {
            findOneBy: mock(async () => null),
            create: mock((value: unknown) => value),
            save: mock(async (value: unknown) => value),
        };
        users = { findOneBy: mock(async () => USER) };
        service = new GoogleConnectService(
            env,
            factory as unknown as GoogleOAuthClientFactory,
            consents as unknown as OAuthPendingConsentRepository,
            credentials as unknown as GoogleCredentialRepository,
            users as unknown as UserRepository
        );
    });

    describe('start', () => {
        it('throws NOT_CONFIGURED when consent is not configured', async () => {
            consentConfigured = false;

            await expect(service.start(USER, '42')).rejects.toThrow(ErrorMessage.GOOGLE_NOT_CONFIGURED);

            expect(consents.delete).not.toHaveBeenCalled();
            expect(consents.save).not.toHaveBeenCalled();
        });

        it('cleans up then saves a pending row and returns the consent url', async () => {
            factory.create.mockImplementation(() => new OAuth2Client('cid', 'secret', CALLBACK));
            const before = Date.now();

            const url = await service.start(USER, '42');

            const deleteArgs = consents.delete.mock.calls.map((call) => call[0]);
            expect(deleteArgs).toContainEqual({ userId: 'u1' });
            const expiredCleanup = deleteArgs.find((arg) => arg.expiresAt !== undefined);
            expect(expiredCleanup.expiresAt).toBeInstanceOf(FindOperator);
            expect(expiredCleanup.expiresAt.type).toBe('lessThanOrEqual');
            expect(consents.save).toHaveBeenCalledTimes(1);
            const lastDelete = Math.max(...consents.delete.mock.invocationCallOrder);
            expect(lastDelete).toBeLessThan(consents.save.mock.invocationCallOrder[0] as number);

            const saved = consents.save.mock.calls[0]?.[0];
            expect(saved.state).toMatch(/^[0-9a-f]{64}$/);
            expect(saved.userId).toBe('u1');
            expect(saved.chatId).toBe('42');
            expect(saved.codeVerifier.length).toBeGreaterThan(0);
            expect(Math.abs(saved.expiresAt.getTime() - (before + 10 * 60 * 1000))).toBeLessThan(1000);

            const params = new URL(url).searchParams;
            expect(params.get('redirect_uri')).toBe(CALLBACK);
            expect(params.get('state')).toBe(saved.state);
        });
    });

    describe('complete', () => {
        it('returns invalid when nothing is consumed', async () => {
            consents.consumeValid.mockImplementation(async () => null);

            await expect(service.complete({ state: 's', code: 'c' })).resolves.toEqual({ kind: 'invalid' });

            expect(fakeClient.getToken).not.toHaveBeenCalled();
        });

        it('returns invalid when the user no longer exists', async () => {
            users.findOneBy.mockImplementation(async () => null);

            await expect(service.complete({ state: 's', code: 'c' })).resolves.toEqual({ kind: 'invalid' });

            expect(fakeClient.getToken).not.toHaveBeenCalled();
        });

        it('returns denied when Google reports an error', async () => {
            await expect(service.complete({ state: 's', error: 'access_denied' })).resolves.toEqual({
                kind: 'denied',
                userId: 'u1',
                chatId: '42',
            });

            expect(fakeClient.getToken).not.toHaveBeenCalled();
        });

        it('returns invalid without a code', async () => {
            await expect(service.complete({ state: 's' })).resolves.toEqual({ kind: 'invalid' });
        });

        it('connects and reports the email and missing scopes', async () => {
            const outcome = await service.complete({ state: 's', code: 'c' });

            expect(fakeClient.getToken).toHaveBeenCalledWith({ code: 'c', codeVerifier: 'verifier' });
            expect(outcome.kind).toBe('connected');
            if (outcome.kind === 'connected') {
                expect(outcome.googleEmail).toBe('me@gmail.com');
                expect(outcome.missingScopes.length).toBeGreaterThan(0);
                expect(outcome.userId).toBe('u1');
                expect(outcome.chatId).toBe('42');
            }
            expect(credentials.save).toHaveBeenCalledTimes(1);
        });

        it('returns failed when completeAuth throws', async () => {
            fakeClient.getToken.mockImplementation(async () => ({ tokens: { id_token: 'idt' } }));

            await expect(service.complete({ state: 's', code: 'c' })).resolves.toEqual({
                kind: 'failed',
                userId: 'u1',
                chatId: '42',
                message: ErrorMessage.GOOGLE_NO_REFRESH_TOKEN,
            });
        });

        it('hides internal error text behind a generic failed message', async () => {
            fakeClient.getToken.mockImplementation(async () => {
                throw new Error('duplicate key value violates unique constraint');
            });

            await expect(service.complete({ state: 's', code: 'c' })).resolves.toEqual({
                kind: 'failed',
                userId: 'u1',
                chatId: '42',
                message: 'Could not connect Google.',
            });
        });
    });
});
