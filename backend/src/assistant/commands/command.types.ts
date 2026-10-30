import type { User } from '../../common/entities';
import type { MessageFormat } from '../../common/integrations';

export type CommandContext = {
    user: User;
    chatId: string;
    args: string;
};

/** A plain string reply, or text in a specific format (e.g. HTML with a link). */
export type CommandReply = string | { text: string; format: MessageFormat };

export interface CommandHandler {
    readonly name: string;
    readonly description: string;
    handle(ctx: CommandContext): Promise<CommandReply>;
}
