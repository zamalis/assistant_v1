import { ErrorMessage, HttpStatusCode } from '../enums';

import { BaseError } from './base.error';

export class ForbiddenError extends BaseError {
    constructor(message: string = ErrorMessage.FORBIDDEN) {
        super(message, HttpStatusCode.FORBIDDEN);
    }
}
