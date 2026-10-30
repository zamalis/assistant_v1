import type { Env } from '../../schemas';

import { inject, injectable } from 'tsyringe';
import { LessThanOrEqual } from 'typeorm';

import { decodeEncryptionKey } from '../../crypto';
import { User } from '../../entities';
import { ErrorMessage, GoogleAuthErrorReason } from '../../enums';
import { BaseError, GoogleAuthError } from '../../errors';
import { type AppLogger, getAppLogger } from '../../logger';
import { GoogleCredentialRepository, OAuthPendingConsentRepository, UserRepository } from '../../repositories';
import { ENV } from '../../tokens';

import { buildAuthRequest, completeAuth } from './google-oauth.flow';
import { GoogleOAuthClientFactory } from './google-oauth-client.factory';

const GENERIC_FAILURE_MESSAGE = 'Could not connect Google.';

export const CONSENT_TTL_MS = 10 * 60 * 1000;

export type ConnectOutcome =
    | { kind: 'invalid' }
    | { kind: 'denied'; userId: string; chatId: string }
    | { kind: 'failed'; userId: string; chatId: string; message: string }
    | { kind: 'connected'; userId: string; chatId: string; googleEmail: string; missingScopes: string[] };

export interface CompleteConnectInput {
    state: string;
    code?: string;
    error?: string;
}

@injectable()
export class GoogleConnectService {
    private readonly logger: AppLogger = getAppLogger(GoogleConnectService.name);

    constructor(
        @inject(ENV) private readonly env: Env,
        private readonly clientFactory: GoogleOAuthClientFactory,
        private readonly consentRepository: OAuthPendingConsentRepository,
        private readonly credentialRepository: GoogleCredentialRepository,
        private readonly userRepository: UserRepository
    ) {}

    public async start(user: User, chatId: string): Promise<string> {
        if (!this.clientFactory.isConsentConfigured()) {
            throw new GoogleAuthError(GoogleAuthErrorReason.NOT_CONFIGURED, ErrorMessage.GOOGLE_NOT_CONFIGURED);
        }

        await this.consentRepository.delete({ userId: user.id });
        await this.consentRepository.delete({ expiresAt: LessThanOrEqual(new Date()) });

        const client = this.clientFactory.create(this.clientFactory.callbackUrl());
        const { url, state, codeVerifier } = await buildAuthRequest(client);

        await this.consentRepository.save(
            this.consentRepository.create({
                state,
                userId: user.id,
                chatId,
                codeVerifier,
                expiresAt: new Date(Date.now() + CONSENT_TTL_MS),
            })
        );

        return url;
    }

    public async complete({ state, code, error }: CompleteConnectInput): Promise<ConnectOutcome> {
        const pending = await this.consentRepository.consumeValid(state);
        if (!pending) {
            return { kind: 'invalid' };
        }

        const { id: pendingId, userId, chatId, codeVerifier } = pending;
        if (error) {
            return { kind: 'denied', userId, chatId };
        }
        if (!code) {
            return { kind: 'invalid' };
        }

        const user = await this.userRepository.findOneBy({ id: userId });
        if (!user) {
            return { kind: 'invalid' };
        }

        try {
            const { googleEmail, missingScopes } = await completeAuth({
                client: this.clientFactory.create(this.clientFactory.callbackUrl()),
                clientId: this.clientFactory.clientId(),
                code,
                codeVerifier,
                user,
                encryptionKey: decodeEncryptionKey(this.env.TOKEN_ENCRYPTION_KEY),
                repository: this.credentialRepository,
            });
            return { kind: 'connected', userId, chatId, googleEmail, missingScopes };
        } catch (failure) {
            this.logger.error({ err: failure, userId, pendingId }, 'Google connect failed');
            return {
                kind: 'failed',
                userId,
                chatId,
                message: failure instanceof BaseError ? failure.message : GENERIC_FAILURE_MESSAGE,
            };
        }
    }
}
