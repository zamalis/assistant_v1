import type { HttpStatusCode } from '../enums';

import { type ErrorResponse, ErrorResponseSchema } from '../schemas';

export class BaseError extends Error {
    constructor(
        message: string,
        private readonly statusCode: HttpStatusCode
    ) {
        super(message);
        this.name = new.target.name;
    }

    getStatusCode(): HttpStatusCode {
        return this.statusCode;
    }

    toErrorResponse(): ErrorResponse {
        return ErrorResponseSchema.parse({ message: this.message });
    }
}
