export const GoogleAuthErrorReason = {
    NOT_CONFIGURED: 'NOT_CONFIGURED',
    NOT_CONNECTED: 'NOT_CONNECTED',
    SCOPE_MISSING: 'SCOPE_MISSING',
    CREDENTIAL_UNREADABLE: 'CREDENTIAL_UNREADABLE',
    REAUTH_REQUIRED: 'REAUTH_REQUIRED',
} as const;

export type GoogleAuthErrorReason = (typeof GoogleAuthErrorReason)[keyof typeof GoogleAuthErrorReason];
