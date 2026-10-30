import type { MiddlewareHandler } from 'hono';

import { container } from 'tsyringe';

import { LOGGER } from '../tokens';

export const requestLogger = (): MiddlewareHandler => async (c, next) => {
    const startedAt = Date.now();
    await next();

    const logger = container.resolve(LOGGER);
    logger.info(
        {
            method: c.req.method,
            path: c.req.path,
            status: c.res.status,
            durationMs: Date.now() - startedAt,
        },
        'request'
    );
};
