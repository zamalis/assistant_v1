import type { DataSource } from 'typeorm';
import type { AppLogger } from '../logger';
import type { Env } from '../schemas';

import { Environment } from '../enums';

import { createDataSource } from './data-source';

export async function getInitializedDataSource(env: Env, logger: AppLogger): Promise<DataSource> {
    const dataSource = createDataSource(env);

    await dataSource.initialize();

    if (env.NODE_ENV === Environment.DEVELOPMENT) {
        logger.info('Running pending migrations...');
        const appliedMigrations = await dataSource.runMigrations({
            transaction: 'all',
        });
        logger.info(`Completed ${appliedMigrations.length} migrations`);
    } else if (env.NODE_ENV === Environment.PRODUCTION) {
        const hasPendingMigrations = await dataSource.showMigrations();
        if (hasPendingMigrations) {
            logger.warn(
                'WARNING: There are pending migrations. Run migrations separately before starting the application in production.'
            );
        }
    }

    return dataSource;
}
