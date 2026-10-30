import 'reflect-metadata';

import type { ToolProvider } from './common/integrations';
import type { AppLogger } from './common/logger';
import type { Env } from './common/schemas';

import { container } from 'tsyringe';
import { DataSource } from 'typeorm';

import { type CommandHandler, ConnectCommand, ResetCommand, SendCommand, TimezoneCommand } from './assistant/commands';
import { CoreToolProvider, GmailToolProvider, ReminderToolProvider } from './assistant/tools';
import { parseEnv } from './common/config';
import { getInitializedDataSource } from './common/database';
import { GoogleAuthService, TelegramService } from './common/integrations';
import { createLogger } from './common/logger';
import { CHAT_SERVICE, COMMAND_HANDLERS, ENV, LOGGER, TOOL_PROVIDERS } from './common/tokens';

export interface BootstrapResult {
    env: Env;
    logger: AppLogger;
    dataSource: DataSource;
}

export async function bootstrap(): Promise<BootstrapResult> {
    const env = parseEnv();
    const logger = createLogger(env);

    container.registerInstance(ENV, env);
    container.registerInstance(LOGGER, logger);

    const dataSource = await getInitializedDataSource(env, logger);
    container.registerInstance(DataSource, dataSource);

    container.registerSingleton(CHAT_SERVICE, TelegramService);
    container.registerSingleton(GoogleAuthService);
    container.registerSingleton<CommandHandler>(COMMAND_HANDLERS, ResetCommand);
    container.registerSingleton<CommandHandler>(COMMAND_HANDLERS, ConnectCommand);
    container.registerSingleton<CommandHandler>(COMMAND_HANDLERS, SendCommand);
    container.registerSingleton<CommandHandler>(COMMAND_HANDLERS, TimezoneCommand);
    container.registerSingleton<ToolProvider>(TOOL_PROVIDERS, CoreToolProvider);
    container.registerSingleton<ToolProvider>(TOOL_PROVIDERS, GmailToolProvider);
    container.registerSingleton<ToolProvider>(TOOL_PROVIDERS, ReminderToolProvider);

    logger.info('Bootstrap complete: env, logger and data source registered');

    return { env, logger, dataSource };
}
