import type { GoogleConnectService } from '../../../common/integrations/google';
import type { CommandContext } from '../../commands/command.types';

import { ErrorMessage, GoogleAuthErrorReason } from '../../../common/enums';
import { GoogleAuthError } from '../../../common/errors';
import { ConnectCommand } from '../../commands/connect.command';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const user = { id: 'u1' };
const ctx = { user, chatId: '42', args: '' } as unknown as CommandContext;

describe('ConnectCommand', () => {
    let connectService: { start: ReturnType<typeof mock> };
    let command: ConnectCommand;

    beforeEach(() => {
        connectService = { start: mock(async () => 'https://accounts.google.com/x') };
        command = new ConnectCommand(connectService as unknown as GoogleConnectService);
    });

    it('replies with the consent link as a short HTML link', async () => {
        connectService.start.mockImplementation(async () => 'https://accounts.google.com/x?a=1&b="2"');

        await expect(command.handle(ctx)).resolves.toEqual({
            text: '<a href="https://accounts.google.com/x?a=1&amp;b=&quot;2&quot;">Connect your Google account</a> (link valid 10 minutes)',
            format: 'html',
        });

        expect(connectService.start).toHaveBeenCalledWith(user, '42');
    });

    it('replies with the message when Google is not configured', async () => {
        connectService.start.mockImplementation(async () => {
            throw new GoogleAuthError(GoogleAuthErrorReason.NOT_CONFIGURED, ErrorMessage.GOOGLE_NOT_CONFIGURED);
        });

        await expect(command.handle(ctx)).resolves.toBe(ErrorMessage.GOOGLE_NOT_CONFIGURED);
    });

    it('rethrows unexpected errors', async () => {
        connectService.start.mockImplementation(async () => {
            throw new Error('db');
        });

        await expect(command.handle(ctx)).rejects.toThrow('db');
    });
});
