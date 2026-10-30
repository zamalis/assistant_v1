import { z } from 'zod';

import { Environment, LogLevel } from '../enums';

import { CorsAllowedHeadersSchema, CorsMethodsSchema, CorsOptionEnvSchema, CorsOriginSchema } from './cors.schema';

function isHttpBaseUrl(value: string): boolean {
    if (value.endsWith('/') || !URL.canParse(value)) {
        return false;
    }
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
}

export const EnvSchema = z.object({
    NODE_ENV: z.enum(Environment).default(Environment.DEVELOPMENT),
    LOG_LEVEL: z.enum(LogLevel).default(LogLevel.DEBUG),

    PORT: z.coerce.number().int().positive().default(4000),

    CORS_ORIGIN: CorsOptionEnvSchema.pipe(CorsOriginSchema),
    CORS_METHODS: CorsOptionEnvSchema.pipe(CorsMethodsSchema),
    CORS_ALLOWED_HEADERS: CorsOptionEnvSchema.pipe(CorsAllowedHeadersSchema),

    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USERNAME: z.string().min(1).default('postgres'),
    DB_PASSWORD: z.string().min(1).default('postgres'),
    DB_NAME: z.string().min(1).default('example'),

    EMAIL_HOST: z.string().default(''),
    EMAIL_PORT: z.coerce.number().int().positive().default(587),
    EMAIL_USERNAME: z.string().default(''),
    EMAIL_PASSWORD: z.string().default(''),
    EMAIL_FROM: z.email().default('support@example.com'),
    EMAIL_FROM_NAME: z.string().default('Example'),

    OPENAI_API_KEY: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().default(''),

    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    TOKEN_ENCRYPTION_KEY: z
        .string()
        .default('')
        .refine((value) => value === '' || /^[A-Za-z0-9+/]{43}=$/.test(value), {
            message: 'TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes',
        }),

    PUBLIC_BASE_URL: z
        .string()
        .default('')
        .refine((value) => value === '' || isHttpBaseUrl(value), {
            message: 'PUBLIC_BASE_URL must be an http(s) URL without a trailing slash',
        }),
});

export type Env = z.infer<typeof EnvSchema>;
