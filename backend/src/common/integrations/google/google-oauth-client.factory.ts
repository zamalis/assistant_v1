import type { Env } from '../../schemas';

import { OAuth2Client } from 'google-auth-library';
import { inject, injectable } from 'tsyringe';

import { ENV } from '../../tokens';

export const GOOGLE_OAUTH_CALLBACK_PATH = '/oauth/google/callback';

@injectable()
export class GoogleOAuthClientFactory {
    constructor(@inject(ENV) private readonly env: Env) {}

    isConfigured(): boolean {
        return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET && this.env.TOKEN_ENCRYPTION_KEY);
    }

    isConsentConfigured(): boolean {
        return this.isConfigured() && this.env.PUBLIC_BASE_URL !== '';
    }

    callbackUrl(): string {
        return `${this.env.PUBLIC_BASE_URL}${GOOGLE_OAUTH_CALLBACK_PATH}`;
    }

    clientId(): string {
        return this.env.GOOGLE_CLIENT_ID;
    }

    create(redirectUri?: string): OAuth2Client {
        return new OAuth2Client(this.env.GOOGLE_CLIENT_ID, this.env.GOOGLE_CLIENT_SECRET, redirectUri);
    }
}
