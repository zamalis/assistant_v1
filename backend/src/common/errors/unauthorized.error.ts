import { ErrorMessage, HttpStatusCode } from '../enums';

import { BaseError } from './base.error';

export class UnauthorizedError extends BaseError {
    constructor(message: string = ErrorMessage.UNAUTHORIZED) {
        super(message, HttpStatusCode.UNAUTHORIZED);
    }
}
