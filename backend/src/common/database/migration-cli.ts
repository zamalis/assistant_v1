import 'reflect-metadata';

import type { DataSource } from 'typeorm';

import { container } from 'tsyringe';

import { parseEnv } from '../config';
import { MigrationCommand } from '../enums';
import { type AppLogger, createLogger, getAppLogger } from '../logger';
import { LOGGER } from '../tokens';

import { createDataSource } from './data-source';
import { regenerateMigrationIndex } from './regenerate-migration-index';

const MIGRATIONS_DIR = './src/migrations';
const DATA_SOURCE_PATH = './src/common/database/data-source.cli.ts';
const TYPEORM_CLI = './node_modules/typeorm/cli.js';

const MIGRATION_COMMANDS = Object.values(MigrationCommand);

type TypeormCliCommand = 'migration:generate' | 'migration:create';

interface ExecutedMigration {
    id: number;
    timestamp: number;
    name: string;
}

function isMigrationCommand(value: string): value is MigrationCommand {
    return MIGRATION_COMMANDS.includes(value as MigrationCommand);
}

function commandRequiresName(command: MigrationCommand): boolean {
    return command === MigrationCommand.GENERATE || command === MigrationCommand.CREATE;
}

function resolveMigrationName(name: string): string {
    return name.replace(/\.ts$/, '').split(/[/\\]/).pop() ?? name;
}

function resolveMigrationPath(name: string): string {
    return `${MIGRATIONS_DIR}/${resolveMigrationName(name)}`;
}

function printUsage(logger: AppLogger): void {
    logger.error('Usage: bun run migration <command> [name]');
    logger.error('Commands: status, generate <name>, create <name>, migrate, rollback');
    logger.error('Example: bun run migration generate create-users-table');
}

async function createCliDataSource(logger: AppLogger): Promise<DataSource> {
    const env = parseEnv();
    const dataSource = createDataSource(env);

    await dataSource.initialize();
    logger.info('Database connection established');

    return dataSource;
}

async function destroyDataSource(dataSource: DataSource, logger: AppLogger): Promise<void> {
    if (dataSource.isInitialized) {
        await dataSource.destroy();
        logger.info('Database connection closed');
    }
}

async function withDataSource(logger: AppLogger, action: (dataSource: DataSource) => Promise<void>): Promise<void> {
    const dataSource = await createCliDataSource(logger);

    try {
        await action(dataSource);
    } finally {
        await destroyDataSource(dataSource, logger);
    }
}

async function runTypeormCli(command: TypeormCliCommand, migrationPath: string): Promise<number> {
    const args = [TYPEORM_CLI, command];

    if (command === 'migration:generate') {
        args.push('-d', DATA_SOURCE_PATH);
    }

    args.push(migrationPath);

    const process = Bun.spawn(['bun', ...args], {
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'inherit',
    });

    return process.exited;
}

async function showStatus(dataSource: DataSource, logger: AppLogger): Promise<void> {
    const executed = await dataSource
        .query<ExecutedMigration[]>('SELECT id, timestamp, name FROM migrations ORDER BY id ASC')
        .catch(() => [] as ExecutedMigration[]);
    const executedNames = new Set(executed.map((migration) => migration.name));
    const pending = dataSource.migrations
        .map((migration) => migration.name)
        .filter((migrationName): migrationName is string => Boolean(migrationName))
        .filter((migrationName) => !executedNames.has(migrationName));

    logger.info(
        { applied: executed.length, pending: pending.length },
        `Migration status (${executed.length} applied, ${pending.length} pending)`
    );

    for (const migration of executed) {
        logger.info(`  [applied] ${migration.name}`);
    }

    for (const migrationName of pending) {
        logger.info(`  [pending] ${migrationName}`);
    }
}

async function runMigrate(dataSource: DataSource, logger: AppLogger): Promise<void> {
    const appliedMigrations = await dataSource.runMigrations({ transaction: 'all' });

    if (appliedMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
    }

    for (const migration of appliedMigrations) {
        logger.info(`Applied migration ${migration.name}`);
    }

    logger.info(`Completed ${appliedMigrations.length} migration(s)`);
}

async function runRollback(dataSource: DataSource, logger: AppLogger): Promise<void> {
    await dataSource.undoLastMigration();
    logger.info('Reverted last migration');
}

async function runGenerate(name: string, logger: AppLogger): Promise<number> {
    const migrationPath = resolveMigrationPath(name);
    const exitCode = await runTypeormCli('migration:generate', migrationPath);

    if (exitCode !== 0) {
        return exitCode;
    }

    await regenerateMigrationIndex(logger);
    return 0;
}

async function runCreate(name: string, logger: AppLogger): Promise<number> {
    const migrationPath = resolveMigrationPath(name);
    const exitCode = await runTypeormCli('migration:create', migrationPath);

    if (exitCode !== 0) {
        return exitCode;
    }

    await regenerateMigrationIndex(logger);
    return 0;
}

async function executeCommand(command: MigrationCommand, name: string | undefined, logger: AppLogger): Promise<number> {
    switch (command) {
        case MigrationCommand.STATUS:
            await withDataSource(logger, (dataSource) => showStatus(dataSource, logger));
            return 0;
        case MigrationCommand.MIGRATE:
            await withDataSource(logger, (dataSource) => runMigrate(dataSource, logger));
            return 0;
        case MigrationCommand.ROLLBACK:
            await withDataSource(logger, (dataSource) => runRollback(dataSource, logger));
            return 0;
        case MigrationCommand.GENERATE: {
            if (!name) {
                return 1;
            }

            return runGenerate(name, logger);
        }
        case MigrationCommand.CREATE: {
            if (!name) {
                return 1;
            }

            return runCreate(name, logger);
        }
    }
}

async function main(): Promise<void> {
    const [, , commandArg, name] = process.argv;
    const env = parseEnv();

    container.registerInstance(LOGGER, createLogger(env));
    const logger = getAppLogger('MigrationCli');

    if (!commandArg || !isMigrationCommand(commandArg)) {
        printUsage(logger);
        process.exit(1);
    }

    if (commandRequiresName(commandArg) && !name) {
        logger.error(`Migration name is required for "${commandArg}"`);
        printUsage(logger);
        process.exit(1);
    }

    try {
        const result = await executeCommand(commandArg, name, logger);

        if (typeof result === 'number') {
            process.exit(result);
        }
    } catch (error) {
        logger.error(error, `Migration command "${commandArg}" failed`);
        process.exit(1);
    }
}

await main();
