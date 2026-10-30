import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { container } from 'tsyringe';
import { ZodError } from 'zod';

import { ErrorMessage, HttpStatusCode } from '../enums';
import { BaseError, InternalServerError } from '../errors';
import { LOGGER } from '../tokens';

export const errorHandler: ErrorHandler = (err, c) => {
    if (err instanceof BaseError) {
        return c.json(err.toErrorResponse(), err.getStatusCode() as ContentfulStatusCode);
    }

    if (err instanceof ZodError) {
        return c.json({ message: ErrorMessage.VALIDATION_FAILED, issues: err.issues }, HttpStatusCode.BAD_REQUEST);
    }

    const logger = container.resolve(LOGGER);
    logger.error(err);

    const internalServerError = new InternalServerError();
    return c.json(internalServerError.toErrorResponse(), internalServerError.getStatusCode() as ContentfulStatusCode);
};
