import { type GoogleAuthErrorReason, HttpStatusCode } from '../enums';

import { BaseError } from './base.error';

export class GoogleAuthError extends BaseError {
    constructor(
        readonly reason: GoogleAuthErrorReason,
        message: string
    ) {
        super(message, HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
}
