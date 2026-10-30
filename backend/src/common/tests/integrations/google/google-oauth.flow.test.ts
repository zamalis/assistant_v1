import type { GoogleCredentialRepository } from '../../../repositories';
import { randomBytes } from 'node:crypto';

import { OAuth2Client } from 'google-auth-library';

import { decrypt } from '../../../crypto';
import { ErrorMessage } from '../../../enums';
import { buildAuthRequest, completeAuth, GOOGLE_API_SCOPES, GOOGLE_SCOPES } from '../../../integrations/google';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const FULL_GRANT = `openid https://www.googleapis.com/auth/userinfo.email ${GOOGLE_API_SCOPES.join(' ')}`;

describe('buildAuthRequest', () => {
    it('builds an offline, consent-forcing PKCE URL with every scope', async () => {
        const client = new OAuth2Client('cid', 'secret', 'http://127.0.0.1:5555');

        const { url, state, codeVerifier } = await buildAuthRequest(client);
        const params = new URL(url).searchParams;

        expect(params.get('access_type')).toBe('offline');
        expect(params.get('prompt')).toBe('consent');
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(params.get('code_challenge')).toBeTruthy();
        expect(params.get('state')).toBe(state);
        expect(codeVerifier).toBeTruthy();
        expect(state).toMatch(/^[0-9a-f]{64}$/);
        for (const scope of GOOGLE_SCOPES) {
            expect(params.get('scope')?.split(' ')).toContain(scope);
        }
    });
});

describe('completeAuth', () => {
    const key = randomBytes(32);
    const user = { id: 'u1', name: 'alice' } as never;
    let tokens: Record<string, unknown>;
    let payload: Record<string, unknown>;
    let client: { getToken: ReturnType<typeof mock>; verifyIdToken: ReturnType<typeof mock> };
    let repository: {
        findOneBy: ReturnType<typeof mock>;
        create: ReturnType<typeof mock>;
        save: ReturnType<typeof mock>;
    };

    const run = () =>
        completeAuth({
            client: client as unknown as OAuth2Client,
            clientId: 'cid',
            code: 'the-code',
            codeVerifier: 'the-verifier',
            user,
            encryptionKey: key,
            repository: repository as unknown as GoogleCredentialRepository,
        });

    beforeEach(() => {
        tokens = { refresh_token: 'rt', id_token: 'idt', scope: FULL_GRANT };
        payload = { email: 'me@gmail.com' };
        client = {
            getToken: mock(async () => ({ tokens })),
            verifyIdToken: mock(async () => ({ getPayload: () => payload })),
        };
        repository = {
            findOneBy: mock(async () => null),
            create: mock((value: unknown) => value),
            save: mock(async (value: unknown) => value),
        };
    });

    it('creates a row with an encrypted token', async () => {
        const result = await run();

        const saved = repository.save.mock.calls[0]?.[0] as { refreshToken: string; googleEmail: string };
        expect(saved.refreshToken).not.toBe('rt');
        expect(decrypt(saved.refreshToken, key)).toBe('rt');
        expect(saved.googleEmail).toBe('me@gmail.com');
        expect(result.googleEmail).toBe('me@gmail.com');
        expect(client.getToken).toHaveBeenCalledWith({ code: 'the-code', codeVerifier: 'the-verifier' });
        expect(client.verifyIdToken).toHaveBeenCalledWith({ idToken: 'idt', audience: 'cid' });
    });

    it('treats userinfo.email as granted', async () => {
        const result = await run();

        expect(result.missingScopes).toEqual([]);
    });

    it('reports and saves a partial grant', async () => {
        tokens.scope = `openid https://www.googleapis.com/auth/userinfo.email ${GOOGLE_API_SCOPES.slice(0, 2).join(' ')}`;

        const result = await run();

        expect(result.missingScopes).toEqual([CALENDAR_SCOPE]);
        const saved = repository.save.mock.calls[0]?.[0] as { scopes: string[] };
        expect(saved.scopes).not.toContain(CALENDAR_SCOPE);
        expect(saved.scopes).toContain(GOOGLE_API_SCOPES[0]);
    });

    it('updates the existing row on reconnect', async () => {
        repository.findOneBy.mockResolvedValue({ id: 'c1', userId: 'u1', refreshToken: 'old', scopes: [] });

        await run();

        expect(repository.create).not.toHaveBeenCalled();
        const saved = repository.save.mock.calls[0]?.[0] as { id: string; refreshToken: string };
        expect(saved.id).toBe('c1');
        expect(decrypt(saved.refreshToken, key)).toBe('rt');
    });

    it('rejects when no refresh token is returned', async () => {
        delete tokens.refresh_token;

        await expect(run()).rejects.toThrow(ErrorMessage.GOOGLE_NO_REFRESH_TOKEN);
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects when the ID token has no email', async () => {
        payload = {};

        await expect(run()).rejects.toThrow(ErrorMessage.GOOGLE_NO_EMAIL);
        expect(repository.save).not.toHaveBeenCalled();
    });
});
