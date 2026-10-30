import type { Env } from '../schemas';

import { parseEnv } from '../config';
import { Environment, LogLevel } from '../enums';

export function createTestEnv(overrides: Record<string, string | undefined> = {}): Env {
    return parseEnv({
        NODE_ENV: Environment.TEST,
        LOG_LEVEL: LogLevel.DEBUG,
        OPENAI_API_KEY: 'sk-test',
        ...overrides,
    });
}
