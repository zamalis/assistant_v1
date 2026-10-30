import type { StructuredToolInterface } from '@langchain/core/tools';
import type { z } from 'zod';

import { injectable } from 'tsyringe';

import { NotFoundError } from '../../common/errors';
import { defineTool, type ToolContext, type ToolProvider } from '../../common/integrations';
import { ReminderCancelSchema, ReminderCreateSchema, ReminderListSchema } from '../schemas';

import {
    buildCancelConfirmation,
    buildRecurrence,
    buildReminderConfirmation,
    CalendarService,
    canonicalTimezone,
    nextOccurrence,
    parseRepeat,
    toEventTimes,
    toLocalDateTime,
} from './calendar';

const NO_REMINDERS_TEXT = 'No upcoming reminders.';
const NOT_FOUND_TEXT = 'No such reminder.';
const CANCELLED_TEXT = 'Cancelled.';

type Digest = z.core.util.JSONType;

function resolveTimezone({ user }: ToolContext): string {
    const timezone = canonicalTimezone(user.timezone);
    if (!timezone) {
        throw new Error(`The stored timezone "${user.timezone}" is invalid. Ask the user to run /timezone Area/City.`);
    }
    return timezone;
}

@injectable()
export class ReminderToolProvider implements ToolProvider {
    constructor(private readonly calendarService: CalendarService) {}

    getTools(ctx: ToolContext): StructuredToolInterface[] {
        return [this.createTool(ctx), this.listTool(ctx), this.cancelTool(ctx)];
    }

    private createTool(ctx: ToolContext): StructuredToolInterface {
        // run() and digest() receive the same args object, so it keys the data the digest needs.
        const digests = new WeakMap<object, Digest>();
        return defineTool({
            name: 'reminder_create',
            description:
                "Create a reminder as a Google Calendar event with a popup at the given time. localDateTime is the user's local wall time (YYYY-MM-DDTHH:mm) without an offset or Z. repeat is none, daily, weekdays, weekly or monthly.",
            schema: ReminderCreateSchema,
            run: async (args) => {
                const timezone = resolveTimezone(ctx);
                const { startLocal, endLocal } = toEventTimes(args.localDateTime, timezone, ctx.now);
                const recurrence = buildRecurrence(args.repeat, startLocal);
                const created = await this.calendarService.createReminder(ctx.user, {
                    title: args.title,
                    notes: args.notes,
                    startLocal,
                    endLocal,
                    timezone,
                    recurrence,
                });

                ctx.outbox.push({
                    text: buildReminderConfirmation({
                        title: args.title,
                        startLocal: toLocalDateTime(new Date(created.start), timezone),
                        timezone,
                        repeat: args.repeat,
                    }),
                    format: 'html',
                });
                digests.set(args, { eventId: created.eventId, start: created.start, repeat: args.repeat });
                return `Reminder created (id ${created.eventId}). The confirmation is shown to the user separately.`;
            },
            digest: (args) => digests.get(args) ?? null,
        });
    }

    private listTool(ctx: ToolContext): StructuredToolInterface {
        const digests = new WeakMap<object, Digest>();
        return defineTool({
            name: 'reminder_list',
            description:
                'List the upcoming reminders created by Tempo, with the next time each fires (local time) and its repeat.',
            schema: ReminderListSchema,
            run: async (args) => {
                const timezone = resolveTimezone(ctx);
                const nowLocal = toLocalDateTime(ctx.now, timezone);
                const summaries = await this.calendarService.listReminders(ctx.user, ctx.now);

                const upcoming = summaries
                    .map((summary) => {
                        const repeat = parseRepeat(summary.recurrence);
                        const startLocal = toLocalDateTime(new Date(summary.start), timezone);
                        return {
                            eventId: summary.eventId,
                            title: summary.title,
                            next: nextOccurrence(startLocal, repeat, nowLocal),
                            repeat,
                        };
                    })
                    // A one-off event that already started is still returned by Google until it ends.
                    .filter((item) => item.repeat !== 'none' || item.next > nowLocal)
                    .sort((a, b) => a.next.localeCompare(b.next));

                digests.set(args, { eventIds: upcoming.map((item) => item.eventId) });
                return upcoming.length === 0
                    ? NO_REMINDERS_TEXT
                    : upcoming.map((item) => JSON.stringify(item)).join('\n');
            },
            digest: (args) => digests.get(args) ?? null,
        });
    }

    private cancelTool(ctx: ToolContext): StructuredToolInterface {
        const digests = new WeakMap<object, Digest>();
        return defineTool({
            name: 'reminder_cancel',
            description:
                'Cancel a reminder by event id (from reminder_list). For a repeating reminder this deletes the whole series.',
            schema: ReminderCancelSchema,
            run: async (args) => {
                try {
                    const { title } = await this.calendarService.cancelReminder(ctx.user, args.eventId);
                    ctx.outbox.push({ text: buildCancelConfirmation(title), format: 'html' });
                    digests.set(args, { eventId: args.eventId });
                    return CANCELLED_TEXT;
                } catch (error) {
                    if (error instanceof NotFoundError) {
                        return NOT_FOUND_TEXT;
                    }
                    throw error;
                }
            },
            digest: (args) => digests.get(args) ?? null,
        });
    }
}
