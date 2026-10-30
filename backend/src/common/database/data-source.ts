import type { Env } from '../schemas';

import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import * as assistantEntities from '../../assistant/entities';
import * as migrations from '../../migrations';
import * as commonEntities from '../entities';
import { Environment } from '../enums';

export function createDataSource(env: Env): DataSource {
    const { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME, NODE_ENV } = env;
    const isDevelopment = NODE_ENV === Environment.DEVELOPMENT;

    return new DataSource({
        type: 'postgres',
        host: DB_HOST,
        port: DB_PORT,
        username: DB_USERNAME,
        password: DB_PASSWORD,
        database: DB_NAME,
        synchronize: false,
        logging: isDevelopment,
        entities: [...Object.values(commonEntities), ...Object.values(assistantEntities)],
        migrations: Object.values(migrations),
        namingStrategy: new SnakeNamingStrategy(),
    });
}
