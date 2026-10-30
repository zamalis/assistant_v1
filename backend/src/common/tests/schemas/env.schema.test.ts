import { randomBytes } from 'node:crypto';

import { parseEnv } from '../../config';
import { Environment } from '../../enums';

import { describe, expect, it } from 'bun:test';

describe('EnvSchema chat fields', () => {
    it('reads OPENAI_API_KEY', () => {
        const env = parseEnv({
            NODE_ENV: Environment.TEST,
            OPENAI_API_KEY: 'sk-test',
        });

        expect(env.OPENAI_API_KEY).toBe('sk-test');
    });

    it('requires OPENAI_API_KEY', () => {
        expect(() => parseEnv({ NODE_ENV: Environment.TEST })).toThrow();
    });

    it('defaults TELEGRAM_BOT_TOKEN to empty', () => {
        const env = parseEnv({
            NODE_ENV: Environment.TEST,
            OPENAI_API_KEY: 'sk-test',
        });

        expect(env.TELEGRAM_BOT_TOKEN).toBe('');
    });

    it('reads TELEGRAM_BOT_TOKEN', () => {
        const env = parseEnv({
            NODE_ENV: Environment.TEST,
            OPENAI_API_KEY: 'sk-test',
            TELEGRAM_BOT_TOKEN: '123:abc',
        });

        expect(env.TELEGRAM_BOT_TOKEN).toBe('123:abc');
    });
});

describe('EnvSchema Google fields', () => {
    const base = { NODE_ENV: Environment.TEST, OPENAI_API_KEY: 'sk-test' };

    it('defaults the Google fields to empty', () => {
        const env = parseEnv(base);

        expect(env.GOOGLE_CLIENT_ID).toBe('');
        expect(env.GOOGLE_CLIENT_SECRET).toBe('');
        expect(env.TOKEN_ENCRYPTION_KEY).toBe('');
    });

    it('accepts a 32-byte TOKEN_ENCRYPTION_KEY without the client vars', () => {
        const key = randomBytes(32).toString('base64');
        const env = parseEnv({ ...base, TOKEN_ENCRYPTION_KEY: key });

        expect(env.TOKEN_ENCRYPTION_KEY).toBe(key);
        expect(env.GOOGLE_CLIENT_ID).toBe('');
    });

    it('rejects a TOKEN_ENCRYPTION_KEY that is not 32 bytes of base64', () => {
        expect(() => parseEnv({ ...base, TOKEN_ENCRYPTION_KEY: randomBytes(16).toString('base64') })).toThrow();
        expect(() => parseEnv({ ...base, TOKEN_ENCRYPTION_KEY: 'not-base64!' })).toThrow();
    });
});

describe('EnvSchema PUBLIC_BASE_URL', () => {
    const base = { NODE_ENV: Environment.TEST, OPENAI_API_KEY: 'sk-test' };

    it('defaults to empty', () => {
        expect(parseEnv(base).PUBLIC_BASE_URL).toBe('');
    });

    it.each(['https://tempo.ngrok-free.app', 'http://localhost:4000'])('accepts %p', (url) => {
        expect(parseEnv({ ...base, PUBLIC_BASE_URL: url }).PUBLIC_BASE_URL).toBe(url);
    });

    it.each(['https://tempo.ngrok-free.app/', 'not a url', 'ftp://x.example'])('rejects %p', (url) => {
        expect(() => parseEnv({ ...base, PUBLIC_BASE_URL: url })).toThrow();
    });
});
