import type { NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { NotFoundError } from '../errors';

export const notFoundHandler: NotFoundHandler = (c) => {
    const notFoundError = new NotFoundError();
    return c.json(notFoundError.toErrorResponse(), notFoundError.getStatusCode() as ContentfulStatusCode);
};
