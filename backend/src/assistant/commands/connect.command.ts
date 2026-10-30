import type { CommandContext, CommandHandler, CommandReply } from './command.types';

import { injectable } from 'tsyringe';

import { GoogleAuthErrorReason } from '../../common/enums';
import { GoogleAuthError } from '../../common/errors';
import { GoogleConnectService } from '../../common/integrations/google';
import { escapeHtml } from '../tools/gmail';

@injectable()
export class ConnectCommand implements CommandHandler {
    public readonly name = 'connect';
    public readonly description = 'Connect your Google account';

    constructor(private readonly googleConnectService: GoogleConnectService) {}

    public async handle({ user, chatId }: CommandContext): Promise<CommandReply> {
        try {
            const url = await this.googleConnectService.start(user, chatId);
            return {
                text: `<a href="${escapeHtml(url)}">Connect your Google account</a> (link valid 10 minutes)`,
                format: 'html',
            };
        } catch (error) {
            if (error instanceof GoogleAuthError && error.reason === GoogleAuthErrorReason.NOT_CONFIGURED) {
                return error.message;
            }
            throw error;
        }
    }
}
