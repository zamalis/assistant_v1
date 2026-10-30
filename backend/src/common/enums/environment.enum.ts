export const Environment = {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test',
} as const;

export type Environment = (typeof Environment)[keyof typeof Environment];
