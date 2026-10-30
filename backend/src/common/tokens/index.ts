import type { InjectionToken } from 'tsyringe';
import type { CommandHandler } from '../../assistant/commands/command.types';
import type { ToolProvider } from '../integrations/langchain/tools/tool.types';
import type { AppLogger } from '../logger';
import type { Env } from '../schemas';

import { ChatService } from '../integrations';

export const ENV: InjectionToken<Env> = Symbol('ENV');
export const LOGGER: InjectionToken<AppLogger> = Symbol('LOGGER');
export const CHAT_SERVICE: InjectionToken<ChatService> = Symbol('CHAT_SERVICE');
export const TOOL_PROVIDERS: InjectionToken<ToolProvider> = Symbol('TOOL_PROVIDERS');
export const COMMAND_HANDLERS: InjectionToken<CommandHandler> = Symbol('COMMAND_HANDLERS');
