import { Hono } from 'hono';
import { container } from 'tsyringe';
import { z } from 'zod';

import { ErrorMessage, HttpStatusCode } from '../../enums';
import { NotFoundError } from '../../errors';
import { errorHandler } from '../../handlers';
import { createLogger } from '../../logger';
import { LOGGER } from '../../tokens';
import { createTestEnv } from '../test-env';

import { beforeEach, describe, expect, it } from 'bun:test';

function buildApp(handler: () => unknown): Hono {
    const app = new Hono();
    app.get('/', (c) => {
        handler();
        return c.json({ ok: true });
    });
    app.onError(errorHandler);
    return app;
}

describe('errorHandler', () => {
    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(createTestEnv()));
    });

    it('maps a BaseError to its status code and error response shape', async () => {
        const app = buildApp(() => {
            throw new NotFoundError('User 123 not found');
        });

        const res = await app.request('/');

        expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
        expect(await res.json()).toEqual({ message: 'User 123 not found' });
    });

    it('maps a ZodError to 400 with validation issues', async () => {
        const app = buildApp(() => {
            z.object({ id: z.string() }).parse({});
        });

        const res = await app.request('/');
        const body = (await res.json()) as { message: string; issues: unknown[] };

        expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
        expect(body.message).toBe(ErrorMessage.VALIDATION_FAILED);
        expect(Array.isArray(body.issues)).toBe(true);
    });

    it('maps an unknown error to a 500 internal server error', async () => {
        const app = buildApp(() => {
            throw new Error('boom');
        });

        const res = await app.request('/');

        expect(res.status).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
        expect(await res.json()).toEqual({ message: ErrorMessage.INTERNAL_SERVER_ERROR });
    });
});
