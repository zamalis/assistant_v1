import { ReminderCancelSchema, ReminderCreateSchema, ReminderListSchema } from '../../schemas';

import { describe, expect, it } from 'bun:test';

describe('ReminderCreateSchema', () => {
    const base = { title: 'Call the bank', localDateTime: '2026-10-31T09:00' };

    it('defaults repeat to none', () => {
        expect(ReminderCreateSchema.parse(base).repeat).toBe('none');
    });

    it.each(['2026-10-31T09:00+01:00', '2026-10-31T09:00Z', '2026-10-31T09:00:00', '2026-10-31'])(
        'rejects localDateTime %s',
        (localDateTime) => {
            expect(ReminderCreateSchema.safeParse({ ...base, localDateTime }).success).toBe(false);
        }
    );

    it('rejects a title over 200 chars and an empty one', () => {
        expect(ReminderCreateSchema.safeParse({ ...base, title: 'x'.repeat(201) }).success).toBe(false);
        expect(ReminderCreateSchema.safeParse({ ...base, title: '' }).success).toBe(false);
    });

    it('rejects notes over 1000 chars and unknown repeat values', () => {
        expect(ReminderCreateSchema.safeParse({ ...base, notes: 'x'.repeat(1001) }).success).toBe(false);
        expect(ReminderCreateSchema.safeParse({ ...base, repeat: 'yearly' }).success).toBe(false);
    });
});

describe('ReminderCancelSchema / ReminderListSchema', () => {
    it('requires a bounded event id', () => {
        expect(ReminderCancelSchema.safeParse({ eventId: '' }).success).toBe(false);
        expect(ReminderCancelSchema.safeParse({ eventId: 'x'.repeat(1025) }).success).toBe(false);
        expect(ReminderCancelSchema.safeParse({ eventId: 'abc' }).success).toBe(true);
    });

    it('takes no arguments', () => {
        expect(ReminderListSchema.safeParse({}).success).toBe(true);
    });
});
