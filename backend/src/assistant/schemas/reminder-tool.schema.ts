import { z } from 'zod';

const TITLE_MAX_LENGTH = 200;
const NOTES_MAX_LENGTH = 1000;
const EVENT_ID_MAX_LENGTH = 1024;

export const Repeat = z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']);

export const ReminderCreateSchema = z.object({
    title: z.string().min(1).max(TITLE_MAX_LENGTH).describe('What to be reminded of'),
    notes: z.string().max(NOTES_MAX_LENGTH).optional(),
    localDateTime: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
        .describe("Local wall time in the user's timezone, YYYY-MM-DDTHH:mm, no offset or Z"),
    repeat: Repeat.default('none'),
});

export const ReminderListSchema = z.object({});

export const ReminderCancelSchema = z.object({
    eventId: z.string().min(1).max(EVENT_ID_MAX_LENGTH).describe('Event id from reminder_list'),
});

export type RepeatValue = z.infer<typeof Repeat>;
export type ReminderCreateArgs = z.infer<typeof ReminderCreateSchema>;
export type ReminderCancelArgs = z.infer<typeof ReminderCancelSchema>;
