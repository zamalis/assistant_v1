import type { CommandContext, CommandHandler } from '../../commands/command.types';

import { InternalServerError } from '../../../common/errors';
import { CommandRouter } from '../../commands/command-router';

import { describe, expect, it, mock } from 'bun:test';

const ctx = { user: { id: 'u1' }, chatId: '42', args: 'x' } as unknown as CommandContext;

function fakeHandler(name: string, reply = `${name} reply`) {
    return { name, description: name, handle: mock(() => Promise.resolve(reply)) } satisfies CommandHandler;
}

describe('CommandRouter', () => {
    it('dispatches to the named handler with the exact context', async () => {
        const alpha = fakeHandler('alpha');
        const beta = fakeHandler('beta', 'from beta');
        const router = new CommandRouter([alpha, beta]);

        await expect(router.handle('beta', ctx)).resolves.toBe('from beta');

        expect(beta.handle).toHaveBeenCalledWith(ctx);
        expect(alpha.handle).not.toHaveBeenCalled();
    });

    it('lists the sorted commands with descriptions, one per line, for an unknown name', async () => {
        const router = new CommandRouter([fakeHandler('beta'), fakeHandler('alpha')]);

        await expect(router.handle('zzz', ctx)).resolves.toBe(
            'Unknown command. Available commands:\n• /alpha — alpha\n• /beta — beta'
        );
    });

    it('throws on duplicate command names', () => {
        expect(() => new CommandRouter([fakeHandler('alpha'), fakeHandler('alpha')])).toThrow(InternalServerError);
    });
});
