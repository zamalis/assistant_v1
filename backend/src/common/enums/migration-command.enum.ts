export const MigrationCommand = {
    STATUS: 'status',
    GENERATE: 'generate',
    CREATE: 'create',
    MIGRATE: 'migrate',
    ROLLBACK: 'rollback',
} as const;

export type MigrationCommand = (typeof MigrationCommand)[keyof typeof MigrationCommand];
