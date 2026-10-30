import 'reflect-metadata';

import { parseEnv } from '../config';

import { createDataSource } from './data-source';

// TypeORM CLI entry point — kept separate so application modules stay side-effect free.
export const AppDataSource = createDataSource(parseEnv());
