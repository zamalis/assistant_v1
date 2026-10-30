import { ErrorMessage, HttpStatusCode } from '../enums';

import { BaseError } from './base.error';

export class NotFoundError extends BaseError {
    constructor(message: string = ErrorMessage.NOT_FOUND) {
        super(message, HttpStatusCode.NOT_FOUND);
    }
}
