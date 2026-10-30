import type { ChatService } from '../integrations';

import { container } from 'tsyringe';
import { DataSource } from 'typeorm';

import { createServer } from '../../server';
import { createDataSource } from '../database';
import { createLogger } from '../logger';
import { CHAT_SERVICE, ENV, LOGGER } from '../tokens';

import { createTestEnv } from './test-env';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

describe('createServer', () => {
    beforeEach(() => {
        const env = createTestEnv();
        container.registerInstance(ENV, env);
        container.registerInstance(LOGGER, createLogger(env));
        container.registerInstance(DataSource, createDataSource(env));
        container.registerInstance(CHAT_SERVICE, { sendMessage: async () => undefined } as unknown as ChatService);
    });

    afterEach(() => {
        container.clearInstances();
    });

    it('boots with DI wiring and serves GET /health', async () => {
        const app = createServer();
        const res = await app.request('/health');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
    });

    it('serves the Google OAuth callback and rejects a request without state', async () => {
        const app = createServer();
        const res = await app.request('/oauth/google/callback');

        expect(res.status).toBe(400);
    });
});
