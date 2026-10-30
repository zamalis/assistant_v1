import type { OAuth2Client } from 'google-auth-library';
import type { GoogleCredentialRepository } from '../../../repositories';
import { randomBytes } from 'node:crypto';

import { container } from 'tsyringe';

import { encrypt } from '../../../crypto';
import { GoogleAuthErrorReason } from '../../../enums';
import { GoogleAuthError } from '../../../errors';
import { GOOGLE_API_SCOPES, GoogleAuthService, type GoogleOAuthClientFactory } from '../../../integrations/google';
import { createLogger } from '../../../logger';
import { LOGGER } from '../../../tokens';
import { createTestEnv } from '../../test-env';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const key = randomBytes(32);
const env = createTestEnv({ TOKEN_ENCRYPTION_KEY: key.toString('base64') });
const user = { id: 'u1', name: 'alice' } as never;

function makeCredential(overrides: Record<string, unknown> = {}) {
    return {
        id: 'c1',
        userId: 'u1',
        refreshToken: encrypt('rt', key),
        scopes: [...GOOGLE_API_SCOPES],
        googleEmail: 'alice@gmail.com',
        updatedAt: new Date('2026-10-29T10:00:00Z'),
        ...overrides,
    };
}

function makeFakeClient() {
    return {
        setCredentials: mock(),
        getAccessToken: mock(async () => ({ token: 'at' })),
    };
}

function invalidGrant() {
    return Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } });
}

describe('GoogleAuthService', () => {
    let fakeClient: ReturnType<typeof makeFakeClient>;
    let factory: { isConfigured: ReturnType<typeof mock>; create: ReturnType<typeof mock> };
    let repository: { findOneBy: ReturnType<typeof mock>; delete: ReturnType<typeof mock> };
    let service: GoogleAuthService;

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(env));
        fakeClient = makeFakeClient();
        factory = { isConfigured: mock(() => true), create: mock(() => fakeClient) };
        repository = { findOneBy: mock(async () => makeCredential()), delete: mock(async () => undefined) };
        service = new GoogleAuthService(
            env,
            repository as unknown as GoogleCredentialRepository,
            factory as unknown as GoogleOAuthClientFactory
        );
    });

    async function failure(promise: Promise<unknown>): Promise<GoogleAuthError> {
        const error = await promise.then(
            () => undefined,
            (caught: unknown) => caught
        );
        expect(error).toBeInstanceOf(GoogleAuthError);
        return error as GoogleAuthError;
    }

    it('throws NOT_CONFIGURED when Google env is missing', async () => {
        factory.isConfigured.mockReturnValue(false);

        const error = await failure(service.getClient(user, GOOGLE_API_SCOPES));

        expect(error.reason).toBe(GoogleAuthErrorReason.NOT_CONFIGURED);
        expect(repository.findOneBy).not.toHaveBeenCalled();
    });

    it('throws NOT_CONNECTED when no credential exists', async () => {
        repository.findOneBy.mockResolvedValue(null);

        const error = await failure(service.getClient(user, GOOGLE_API_SCOPES));

        expect(error.reason).toBe(GoogleAuthErrorReason.NOT_CONNECTED);
        expect(error.message).toContain('Send /connect in Telegram to reconnect.');
    });

    it('throws SCOPE_MISSING listing missing scopes', async () => {
        const missing = 'https://www.googleapis.com/auth/calendar.events';
        repository.findOneBy.mockResolvedValue(makeCredential({ scopes: GOOGLE_API_SCOPES.slice(0, 2) }));

        const error = await failure(service.getClient(user, GOOGLE_API_SCOPES));

        expect(error.reason).toBe(GoogleAuthErrorReason.SCOPE_MISSING);
        expect(error.message).toContain(missing);
        expect(error.message).toContain('Send /connect in Telegram to reconnect.');
    });

    it('keeps the row when decryption fails', async () => {
        repository.findOneBy.mockResolvedValue(makeCredential({ refreshToken: encrypt('rt', randomBytes(32)) }));

        const error = await failure(service.getClient(user, GOOGLE_API_SCOPES));

        expect(error.reason).toBe(GoogleAuthErrorReason.CREDENTIAL_UNREADABLE);
        expect(repository.delete).not.toHaveBeenCalled();
    });

    it('deletes the row and evicts the cache on invalid_grant', async () => {
        fakeClient.getAccessToken.mockRejectedValueOnce(invalidGrant());

        const error = await failure(service.getClient(user, GOOGLE_API_SCOPES));

        expect(error.reason).toBe(GoogleAuthErrorReason.REAUTH_REQUIRED);
        expect(error.message).toContain('Send /connect in Telegram to reconnect.');
        expect(repository.delete).toHaveBeenCalledWith({ id: 'c1' });

        await service.getClient(user, GOOGLE_API_SCOPES);
        expect(factory.create).toHaveBeenCalledTimes(2);
    });

    it('turns a grant revoked after caching into REAUTH_REQUIRED and rebuilds the client', async () => {
        await service.getClient(user, GOOGLE_API_SCOPES);
        fakeClient.getAccessToken.mockRejectedValueOnce(invalidGrant());

        const error = await failure(service.getClient(user, GOOGLE_API_SCOPES));

        expect(error.reason).toBe(GoogleAuthErrorReason.REAUTH_REQUIRED);
        expect(repository.delete).toHaveBeenCalledWith({ id: 'c1' });

        await service.getClient(user, GOOGLE_API_SCOPES);
        expect(factory.create).toHaveBeenCalledTimes(2);
    });

    it('rethrows other refresh errors and keeps the row', async () => {
        const networkError = new Error('ECONNRESET');
        fakeClient.getAccessToken.mockRejectedValueOnce(networkError);

        await expect(service.getClient(user, GOOGLE_API_SCOPES)).rejects.toBe(networkError);
        expect(repository.delete).not.toHaveBeenCalled();
    });

    it('reuses the cached client', async () => {
        const first = await service.getClient(user, GOOGLE_API_SCOPES);
        const second = await service.getClient(user, GOOGLE_API_SCOPES);

        expect(factory.create).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
    });

    it('rebuilds the client when updatedAt changes', async () => {
        await service.getClient(user, GOOGLE_API_SCOPES);
        repository.findOneBy.mockResolvedValue(makeCredential({ updatedAt: new Date('2026-10-29T11:00:00Z') }));

        await service.getClient(user, GOOGLE_API_SCOPES);

        expect(factory.create).toHaveBeenCalledTimes(2);
    });

    it('sets the decrypted refresh token', async () => {
        const client = await service.getClient(user, GOOGLE_API_SCOPES);

        expect(client as unknown as OAuth2Client).toBe(fakeClient as unknown as OAuth2Client);
        expect(fakeClient.setCredentials).toHaveBeenCalledWith({ refresh_token: 'rt' });
    });
});
