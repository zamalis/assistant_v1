import type { OAuth2Client } from 'google-auth-library';
import type { GoogleCredential, User } from '../../entities';
import type { Env } from '../../schemas';

import { inject, injectable } from 'tsyringe';

import { decodeEncryptionKey, decrypt } from '../../crypto';
import { ErrorMessage, GoogleAuthErrorReason } from '../../enums';
import { GoogleAuthError } from '../../errors';
import { type AppLogger, getAppLogger } from '../../logger';
import { GoogleCredentialRepository } from '../../repositories';
import { ENV } from '../../tokens';

import { GoogleOAuthClientFactory } from './google-oauth-client.factory';

interface CachedClient {
    client: OAuth2Client;
    updatedAt: number;
}

function isInvalidGrant(error: unknown): boolean {
    const data = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data;

    return data?.error === 'invalid_grant';
}

@injectable()
export class GoogleAuthService {
    private readonly logger: AppLogger = getAppLogger(GoogleAuthService.name);
    private readonly clients = new Map<string, CachedClient>();

    constructor(
        @inject(ENV) private readonly env: Env,
        private readonly credentialRepository: GoogleCredentialRepository,
        private readonly clientFactory: GoogleOAuthClientFactory
    ) {}

    async getClient(user: User, requiredScopes: readonly string[]): Promise<OAuth2Client> {
        if (!this.clientFactory.isConfigured()) {
            throw new GoogleAuthError(GoogleAuthErrorReason.NOT_CONFIGURED, ErrorMessage.GOOGLE_NOT_CONFIGURED);
        }

        const reconnectHint = 'Send /connect in Telegram to reconnect.';
        const credential = await this.credentialRepository.findOneBy({ userId: user.id });

        if (!credential) {
            throw new GoogleAuthError(
                GoogleAuthErrorReason.NOT_CONNECTED,
                `${ErrorMessage.GOOGLE_NOT_CONNECTED} ${reconnectHint}`
            );
        }

        const missing = requiredScopes.filter((scope) => !credential.scopes.includes(scope));

        if (missing.length > 0) {
            throw new GoogleAuthError(
                GoogleAuthErrorReason.SCOPE_MISSING,
                `${ErrorMessage.GOOGLE_SCOPE_MISSING} ${missing.join(', ')}. ${reconnectHint}`
            );
        }

        const updatedAt = credential.updatedAt.getTime();
        const cached = this.clients.get(user.id);

        if (cached && cached.updatedAt === updatedAt) {
            await this.verifyGrant(cached.client, user, credential, reconnectHint);

            return cached.client;
        }

        let refreshToken: string;

        try {
            refreshToken = decrypt(credential.refreshToken, decodeEncryptionKey(this.env.TOKEN_ENCRYPTION_KEY));
        } catch (error) {
            this.logger.error({ err: error, userId: user.id, credentialId: credential.id });
            throw new GoogleAuthError(
                GoogleAuthErrorReason.CREDENTIAL_UNREADABLE,
                ErrorMessage.GOOGLE_CREDENTIAL_UNREADABLE
            );
        }

        const client = this.clientFactory.create();
        client.setCredentials({ refresh_token: refreshToken });

        await this.verifyGrant(client, user, credential, reconnectHint);

        this.clients.set(user.id, { client, updatedAt });

        return client;
    }

    // getAccessToken() makes no request while the cached token is valid, so this also catches a grant that was
    // revoked or expired after the client was cached, instead of failing inside a Gmail or Calendar call.
    private async verifyGrant(
        client: OAuth2Client,
        user: User,
        credential: GoogleCredential,
        reconnectHint: string
    ): Promise<void> {
        try {
            await client.getAccessToken();
        } catch (error) {
            if (isInvalidGrant(error)) {
                this.logger.warn({ userId: user.id }, 'Google refresh token was rejected; removing credential');
                await this.credentialRepository.delete({ id: credential.id });
                this.clients.delete(user.id);
                throw new GoogleAuthError(
                    GoogleAuthErrorReason.REAUTH_REQUIRED,
                    `${ErrorMessage.GOOGLE_REAUTH_REQUIRED} ${reconnectHint}`
                );
            }

            // Gaxios errors carry the request config (including the refresh token), so log the message only.
            this.logger.error(
                { userId: user.id, reason: error instanceof Error ? error.message : String(error) },
                'Google access token refresh failed'
            );
            throw error;
        }
    }
}
