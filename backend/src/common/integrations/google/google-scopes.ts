export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email'] as const;

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
export const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export const GOOGLE_API_SCOPES = [GMAIL_READ_SCOPE, GMAIL_COMPOSE_SCOPE, CALENDAR_EVENTS_SCOPE] as const;

export const GOOGLE_SCOPES = [...GOOGLE_IDENTITY_SCOPES, ...GOOGLE_API_SCOPES] as const;
