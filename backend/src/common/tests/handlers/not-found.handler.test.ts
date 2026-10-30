import { Hono } from 'hono';

import { ErrorMessage, HttpStatusCode } from '../../enums';
import { notFoundHandler } from '../../handlers';

import { describe, expect, it } from 'bun:test';

describe('notFoundHandler', () => {
    it('returns a 404 with the standard error response shape', async () => {
        const app = new Hono();
        app.notFound(notFoundHandler);

        const res = await app.request('/unknown-route');

        expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
        expect(await res.json()).toEqual({ message: ErrorMessage.NOT_FOUND });
    });
});
