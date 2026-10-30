import type { User } from '../../../common/entities/user.entity';
import type { ToolContext } from '../../../common/integrations';
import type { CalendarService } from '../../tools/calendar';

import { container } from 'tsyringe';

import { NotFoundError } from '../../../common/errors';
import { createLogger } from '../../../common/logger';
import { createTestEnv } from '../../../common/tests/test-env';
import { LOGGER } from '../../../common/tokens';
import { ReminderToolProvider } from '../../tools';
import { buildCancelConfirmation, buildReminderConfirmation } from '../../tools/calendar';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const NOW = new Date('2026-10-30T12:00:00Z');

describe('ReminderToolProvider', () => {
    const env = createTestEnv();
    let calendar: Record<'createReminder' | 'listReminders' | 'cancelReminder', ReturnType<typeof mock>>;
    let user: User;
    let ctx: ToolContext;

    function invoke(name: string, args: Record<string, unknown>) {
        const tool = new ReminderToolProvider(calendar as unknown as CalendarService)
            .getTools(ctx)
            .find((t) => t.name === name);
        if (!tool) {
            throw new Error(`no tool ${name}`);
        }
        return tool.invoke({ id: 'call_1', name, args, type: 'tool_call' });
    }

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(env));
        calendar = {
            createReminder: mock(async () => ({ eventId: 'e1', start: '2026-10-31T09:00:00+01:00' })),
            listReminders: mock(async () => []),
            cancelReminder: mock(async () => ({ title: 'Call bank' })),
        };
        user = { id: 'u1', timezone: 'Europe/Paris' } as User;
        ctx = { user, now: NOW, timezone: 'Europe/Paris', outbox: [] };
    });

    describe('reminder_create', () => {
        const args = { title: 'Call bank', notes: 'the fee', localDateTime: '2026-10-31T09:00', repeat: 'weekly' };

        it('creates the event and pushes the html confirmation', async () => {
            const message = await invoke('reminder_create', args);

            expect(calendar.createReminder).toHaveBeenCalledWith(user, {
                title: 'Call bank',
                notes: 'the fee',
                startLocal: '2026-10-31T09:00',
                endLocal: '2026-10-31T09:15',
                timezone: 'Europe/Paris',
                recurrence: 'RRULE:FREQ=WEEKLY',
            });
            expect(ctx.outbox).toEqual([
                {
                    text: buildReminderConfirmation({
                        title: 'Call bank',
                        startLocal: '2026-10-31T09:00',
                        timezone: 'Europe/Paris',
                        repeat: 'weekly',
                    }),
                    format: 'html',
                },
            ]);
            expect(message.content).toBe('Reminder created (id e1). The confirmation is shown to the user separately.');
        });

        it('keeps the title and notes out of the stored digest', async () => {
            const message = await invoke('reminder_create', args);

            expect(message.artifact).toEqual({ eventId: 'e1', start: '2026-10-31T09:00:00+01:00', repeat: 'weekly' });
            expect(JSON.stringify(message.artifact)).not.toContain('Call bank');
            expect(JSON.stringify(message.artifact)).not.toContain('the fee');
        });

        it('refuses an invalid stored timezone without calling Calendar', async () => {
            user.timezone = 'Mars/Base';

            await expect(invoke('reminder_create', args)).rejects.toThrow(
                'The stored timezone "Mars/Base" is invalid. Ask the user to run /timezone Area/City.'
            );
            expect(calendar.createReminder).not.toHaveBeenCalled();
        });

        it('surfaces a past time and pushes nothing', async () => {
            await expect(invoke('reminder_create', { ...args, localDateTime: '2026-10-30T09:00' })).rejects.toThrow(
                'in the past'
            );
            expect(calendar.createReminder).not.toHaveBeenCalled();
            expect(ctx.outbox).toEqual([]);
        });
    });

    describe('reminder_list', () => {
        it('drops a one-off that started five minutes ago and shows the next occurrence of a series', async () => {
            calendar.listReminders.mockImplementation(async () => [
                { eventId: 'old', title: 'Started', start: '2026-10-30T12:55:00+01:00', recurrence: null },
                {
                    eventId: 'series',
                    title: 'Standup',
                    start: '2026-10-01T09:00:00+02:00',
                    recurrence: ['RRULE:FREQ=WEEKLY'],
                },
            ]);

            const message = await invoke('reminder_list', {});

            expect(calendar.listReminders).toHaveBeenCalledWith(user, ctx.now);
            expect(message.content).toBe(
                JSON.stringify({ eventId: 'series', title: 'Standup', next: '2026-11-05T09:00', repeat: 'weekly' })
            );
            expect(message.artifact).toEqual({ eventIds: ['series'] });
        });

        it('reports an empty list', async () => {
            const message = await invoke('reminder_list', {});

            expect(message.content).toBe('No upcoming reminders.');
        });
    });

    describe('reminder_cancel', () => {
        it('answers "No such reminder." for an unknown or foreign event', async () => {
            calendar.cancelReminder.mockRejectedValue(new NotFoundError('Event x not found'));

            const message = await invoke('reminder_cancel', { eventId: 'x' });

            expect(message.content).toBe('No such reminder.');
            expect(ctx.outbox).toEqual([]);
        });

        it('pushes the cancel confirmation on success', async () => {
            const message = await invoke('reminder_cancel', { eventId: 'e1' });

            expect(calendar.cancelReminder).toHaveBeenCalledWith(user, 'e1');
            expect(ctx.outbox).toEqual([{ text: buildCancelConfirmation('Call bank'), format: 'html' }]);
            expect(message.content).toBe('Cancelled.');
            expect(message.artifact).toEqual({ eventId: 'e1' });
        });
    });
});
