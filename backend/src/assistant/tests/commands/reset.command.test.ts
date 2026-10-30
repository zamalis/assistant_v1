import type { CommandContext } from '../../commands/command.types';
import type { MessageService } from '../../services/message.service';

import { ResetCommand } from '../../commands/reset.command';

import { describe, expect, it, mock } from 'bun:test';

describe('ResetCommand', () => {
    it('clears the notebook and confirms', async () => {
        const messageService = { reset: mock(() => Promise.resolve()) };
        const command = new ResetCommand(messageService as unknown as MessageService);
        const ctx = { user: { id: 'u1' }, chatId: '42', args: '' } as unknown as CommandContext;

        await expect(command.handle(ctx)).resolves.toBe('notebook cleared');

        expect(messageService.reset).toHaveBeenCalledWith('u1');
    });
});
