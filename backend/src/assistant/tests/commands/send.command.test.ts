import type { CommandContext } from '../../commands/command.types';
import type { GmailPendingSendRepository } from '../../repositories';
import type { GmailService } from '../../tools/gmail';

import { container } from 'tsyringe';

import { GoogleAuthErrorReason } from '../../../common/enums';
import { GoogleAuthError, NotFoundError } from '../../../common/errors';
import { createLogger } from '../../../common/logger';
import { createTestEnv } from '../../../common/tests/test-env';
import { LOGGER } from '../../../common/tokens';
import { SendCommand } from '../../commands/send.command';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const user = { id: 'u1' };
const ctx = { user, chatId: '42', args: '' } as unknown as CommandContext;

describe('SendCommand', () => {
    const env = createTestEnv();
    let repository: { consumeSendable: ReturnType<typeof mock> };
    let gmail: { sendDraft: ReturnType<typeof mock> };
    let command: SendCommand;

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(env));
        repository = {
            consumeSendable: mock(async () => ({ draftId: 'd1', recipients: ['a@x.com', 'b@y.com'] })),
        };
        gmail = { sendDraft: mock(async () => undefined) };
        command = new SendCommand(
            repository as unknown as GmailPendingSendRepository,
            gmail as unknown as GmailService
        );
    });

    it('is named send', () => {
        expect(command.name).toBe('send');
        expect(command.description).toBe('Send the draft shown in the last preview');
    });

    it('sends the consumed draft and lists the recipients', async () => {
        await expect(command.handle(ctx)).resolves.toBe('Sent to a@x.com, b@y.com.');

        expect(repository.consumeSendable).toHaveBeenCalledWith('u1');
        expect(gmail.sendDraft).toHaveBeenCalledWith(user, 'd1');
    });

    it('refuses when no reviewed draft is waiting', async () => {
        repository.consumeSendable.mockImplementation(async () => null);

        await expect(command.handle(ctx)).resolves.toBe('No reviewed draft waiting. Ask me to draft one first.');

        expect(gmail.sendDraft).not.toHaveBeenCalled();
    });

    it('says so when the draft was deleted in Gmail', async () => {
        gmail.sendDraft.mockRejectedValue(new NotFoundError('Draft d1 not found'));

        await expect(command.handle(ctx)).resolves.toBe('That draft no longer exists.');
    });

    it('relays a Google auth error as the reply', async () => {
        gmail.sendDraft.mockRejectedValue(
            new GoogleAuthError(GoogleAuthErrorReason.REAUTH_REQUIRED, 'Google access expired. Use /connect.')
        );

        await expect(command.handle(ctx)).resolves.toBe('Google access expired. Use /connect.');
    });

    it('explains that the draft is still in Gmail when sending fails', async () => {
        gmail.sendDraft.mockRejectedValue(new Error('Gmail is temporarily unavailable (503)'));

        await expect(command.handle(ctx)).resolves.toBe(
            'Could not send: Gmail is temporarily unavailable (503). The draft is still in your Gmail drafts.'
        );
    });

    it('rejects when the pending lookup itself fails', async () => {
        repository.consumeSendable.mockRejectedValue(new Error('db down'));

        await expect(command.handle(ctx)).rejects.toThrow('db down');
        expect(gmail.sendDraft).not.toHaveBeenCalled();
    });
});
