import { ErrorMessage, HttpStatusCode } from '../enums';

import { BaseError } from './base.error';

export class BadRequestError extends BaseError {
    constructor(message: string = ErrorMessage.BAD_REQUEST) {
        super(message, HttpStatusCode.BAD_REQUEST);
    }
}
