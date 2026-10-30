export const LogLevel = {
    TRACE: 'trace',
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'fatal',
    SILENT: 'silent',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
