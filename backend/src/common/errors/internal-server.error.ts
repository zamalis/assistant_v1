import { ErrorMessage, HttpStatusCode } from '../enums';

import { BaseError } from './base.error';

export class InternalServerError extends BaseError {
    constructor(message: string = ErrorMessage.INTERNAL_SERVER_ERROR) {
        super(message, HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
}
