export const ErrorMessage = {
    BAD_REQUEST: 'Bad request',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    NOT_FOUND: 'Resource not found',
    INTERNAL_SERVER_ERROR: 'Internal server error',
    VALIDATION_FAILED: 'Validation failed',
    OPENAI_API_KEY_REQUIRED: 'OPENAI_API_KEY is not set',
    USER_NOT_ALLOWED: 'User is not allowed to chat',
    EMPTY_MODEL_REPLY: 'Model returned an empty reply',
    DUPLICATE_TOOL_NAME: 'Duplicate tool name',
    DUPLICATE_COMMAND_NAME: 'Duplicate command name.',
    MODEL_TOOLS_UNSUPPORTED: 'Model does not support tool calling',
    GOOGLE_NOT_CONFIGURED: 'Google is not configured on this server.',
    GOOGLE_NOT_CONNECTED: 'Google account is not connected.',
    GOOGLE_SCOPE_MISSING: 'Missing Google permissions:',
    GOOGLE_CREDENTIAL_UNREADABLE: 'Stored Google credentials could not be read; check TOKEN_ENCRYPTION_KEY.',
    GOOGLE_REAUTH_REQUIRED: 'Google access expired or was revoked.',
    GOOGLE_NO_REFRESH_TOKEN:
        'Google returned no refresh token. Remove Tempo at https://myaccount.google.com/permissions and retry.',
    GOOGLE_NO_EMAIL: 'Google ID token has no email.',
} as const;

export type ErrorMessage = (typeof ErrorMessage)[keyof typeof ErrorMessage];
