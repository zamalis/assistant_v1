import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { container } from 'tsyringe';

import { errorHandler, notFoundHandler } from './common/handlers';
import { GoogleOAuthRouter } from './common/integrations/google';
import { requestLogger } from './common/middlewares';
import { BaseRouter } from './common/routers';
import { CorsAny } from './common/schemas';
import { ENV } from './common/tokens';

function resolveRouters(): BaseRouter[] {
    return [container.resolve(GoogleOAuthRouter)];
}

export function createServer(): Hono {
    const env = container.resolve(ENV);
    const app = new Hono();

    app.use('*', requestLogger());
    app.use(
        '*',
        cors({
            origin: env.CORS_ORIGIN,
            credentials: true,
            ...(env.CORS_METHODS !== CorsAny && { allowMethods: env.CORS_METHODS }),
            ...(env.CORS_ALLOWED_HEADERS !== CorsAny && { allowHeaders: env.CORS_ALLOWED_HEADERS }),
        })
    );

    app.get('/health', (c) => c.json({ status: 'ok' }));

    for (const router of resolveRouters()) {
        app.route(router.getPath(), router.getApp());
    }

    app.notFound(notFoundHandler);
    app.onError(errorHandler);

    return app;
}
