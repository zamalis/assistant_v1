import type { CommandContext, CommandHandler } from './command.types';

import { injectable } from 'tsyringe';

import { MessageService } from '../services/message.service';

const RESET_REPLY = 'notebook cleared';

@injectable()
export class ResetCommand implements CommandHandler {
    public readonly name = 'reset';
    public readonly description = 'Clear the conversation history';

    constructor(private readonly messageService: MessageService) {}

    public async handle({ user }: CommandContext): Promise<string> {
        await this.messageService.reset(user.id);
        return RESET_REPLY;
    }
}
