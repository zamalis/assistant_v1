import type { CommandContext, CommandHandler, CommandReply } from './command.types';

import { injectAll, injectable } from 'tsyringe';

import { ErrorMessage } from '../../common/enums';
import { InternalServerError } from '../../common/errors';
import { COMMAND_HANDLERS } from '../../common/tokens';

@injectable()
export class CommandRouter {
    private readonly handlers = new Map<string, CommandHandler>();

    constructor(@injectAll(COMMAND_HANDLERS) handlers: CommandHandler[]) {
        for (const handler of handlers) {
            if (this.handlers.has(handler.name)) {
                throw new InternalServerError(ErrorMessage.DUPLICATE_COMMAND_NAME);
            }
            this.handlers.set(handler.name, handler);
        }
    }

    public handle(command: string, ctx: CommandContext): Promise<CommandReply> {
        const handler = this.handlers.get(command);
        if (!handler) {
            return Promise.resolve(this.unknownCommandReply());
        }

        return handler.handle(ctx);
    }

    private unknownCommandReply(): string {
        const lines = [...this.handlers.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((handler) => `• /${handler.name} — ${handler.description}`);
        return ['Unknown command. Available commands:', ...lines].join('\n');
    }
}
