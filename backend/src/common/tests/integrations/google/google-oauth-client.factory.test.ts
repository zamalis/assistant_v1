import { GOOGLE_OAUTH_CALLBACK_PATH, GoogleOAuthClientFactory } from '../../../integrations/google';
import { createTestEnv } from '../../test-env';

import { describe, expect, it } from 'bun:test';

const KEY = Buffer.alloc(32, 1).toString('base64');
const configured = {
    GOOGLE_CLIENT_ID: 'cid',
    GOOGLE_CLIENT_SECRET: 'secret',
    TOKEN_ENCRYPTION_KEY: KEY,
};

describe('GoogleOAuthClientFactory consent config', () => {
    it('is not consent-configured without PUBLIC_BASE_URL', () => {
        const factory = new GoogleOAuthClientFactory(createTestEnv(configured));

        expect(factory.isConfigured()).toBe(true);
        expect(factory.isConsentConfigured()).toBe(false);
    });

    it('is consent-configured with all four vars set', () => {
        const factory = new GoogleOAuthClientFactory(
            createTestEnv({ ...configured, PUBLIC_BASE_URL: 'https://t.example' })
        );

        expect(factory.isConsentConfigured()).toBe(true);
    });

    it('builds the callback url from PUBLIC_BASE_URL', () => {
        const factory = new GoogleOAuthClientFactory(
            createTestEnv({ ...configured, PUBLIC_BASE_URL: 'https://t.example' })
        );

        expect(GOOGLE_OAUTH_CALLBACK_PATH).toBe('/oauth/google/callback');
        expect(factory.callbackUrl()).toBe('https://t.example/oauth/google/callback');
    });
});
