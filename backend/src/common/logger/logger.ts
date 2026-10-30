import type { Env } from '../schemas';

import pino, { type Logger } from 'pino';
import { container } from 'tsyringe';

import { Environment } from '../enums';
import { LOGGER } from '../tokens';

export type AppLogger = Logger;

export function createLogger(env: Env): Logger {
    const isDevelopment = env.NODE_ENV === Environment.DEVELOPMENT;

    return pino({
        level: env.LOG_LEVEL,
        timestamp: pino.stdTimeFunctions.isoTime,
        transport: isDevelopment ? { target: 'pino-pretty' } : undefined,
    });
}

export function getAppLogger(serviceName: string): Logger {
    return container.resolve(LOGGER).child({ serviceName });
}
