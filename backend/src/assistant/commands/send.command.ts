import type { CommandContext, CommandHandler } from './command.types';

import { injectable } from 'tsyringe';

import { GoogleAuthError, NotFoundError } from '../../common/errors';
import { type AppLogger, getAppLogger } from '../../common/logger';
import { GmailPendingSendRepository } from '../repositories';
import { GmailService } from '../tools/gmail';

@injectable()
export class SendCommand implements CommandHandler {
    public readonly name = 'send';
    public readonly description = 'Send the draft shown in the last preview';

    private readonly logger: AppLogger = getAppLogger(SendCommand.name);

    constructor(
        private readonly pendingSendRepository: GmailPendingSendRepository,
        private readonly gmailService: GmailService
    ) {}

    public async handle({ user }: CommandContext): Promise<string> {
        const pending = await this.pendingSendRepository.consumeSendable(user.id);
        if (!pending) {
            return 'No reviewed draft waiting. Ask me to draft one first.';
        }

        try {
            await this.gmailService.sendDraft(user, pending.draftId);
            return `Sent to ${pending.recipients.join(', ')}.`;
        } catch (error) {
            if (error instanceof NotFoundError) {
                return 'That draft no longer exists.';
            }
            if (error instanceof GoogleAuthError) {
                return error.message;
            }
            this.logger.error({ err: error, userId: user.id, draftId: pending.draftId }, 'Failed to send draft');
            const message = error instanceof Error ? error.message : 'unknown error';
            return `Could not send: ${message}. The draft is still in your Gmail drafts.`;
        }
    }
}
