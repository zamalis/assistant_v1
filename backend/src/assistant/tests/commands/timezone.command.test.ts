import type { UserRepository } from '../../../common/repositories';
import type { CommandContext } from '../../commands/command.types';

import { TimezoneCommand } from '../../commands/timezone.command';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

function ctx(args: string, timezone = 'UTC'): CommandContext {
    return { user: { id: 'u1', timezone }, chatId: '42', args } as unknown as CommandContext;
}

describe('TimezoneCommand', () => {
    let repository: { update: ReturnType<typeof mock> };
    let command: TimezoneCommand;

    beforeEach(() => {
        repository = { update: mock(async () => undefined) };
        command = new TimezoneCommand(repository as unknown as UserRepository);
    });

    it('is named timezone', () => {
        expect(command.name).toBe('timezone');
        expect(command.description).toBe('Show or set your timezone (IANA name, e.g. Europe/Paris)');
    });

    it('shows the current timezone and local time without arguments', async () => {
        const reply = await command.handle(ctx('', 'Europe/Paris'));

        expect(reply).toMatch(/^Your timezone is Europe\/Paris \(now \d{2}:\d{2}\)\.$/);
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('says so when the stored timezone is invalid and no argument is given', async () => {
        const reply = await command.handle(ctx('', 'Mars/Base'));

        expect(reply).toBe('Your stored timezone "Mars/Base" is invalid. Set one with /timezone Area/City.');
    });

    it('saves a valid timezone', async () => {
        const reply = await command.handle(ctx('Europe/Paris'));

        expect(repository.update).toHaveBeenCalledWith({ id: 'u1' }, { timezone: 'Europe/Paris' });
        expect(reply).toMatch(/^Timezone set to Europe\/Paris \(now \d{2}:\d{2}\)\.$/);
    });

    it('trims padding and fixes the case', async () => {
        const reply = await command.handle(ctx('   europe/paris  '));

        expect(repository.update).toHaveBeenCalledWith({ id: 'u1' }, { timezone: 'Europe/Paris' });
        expect(reply).toStartWith('Timezone set to Europe/Paris');
    });

    it('rejects an unknown timezone without writing', async () => {
        const reply = await command.handle(ctx('Mars/Base'));

        expect(reply).toBe("Unknown timezone 'Mars/Base'. Use an IANA name like Europe/Paris.");
        expect(repository.update).not.toHaveBeenCalled();
    });
});
