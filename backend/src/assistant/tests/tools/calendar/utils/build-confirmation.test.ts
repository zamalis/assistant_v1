import { buildCancelConfirmation, buildReminderConfirmation } from '../../../../tools/calendar';

import { describe, expect, it } from 'bun:test';

const input = {
    title: 'Call <bank>',
    startLocal: '2026-10-31T09:00',
    timezone: 'Europe/Paris',
    repeat: 'weekly',
} as const;

describe('buildReminderConfirmation', () => {
    it('escapes the title and describes the repeat', () => {
        expect(buildReminderConfirmation(input)).toBe(
            '⏰ Reminder set: <b>Call &lt;bank&gt;</b>, Sat 31 Oct 2026, 09:00 (Europe/Paris), repeats weekly'
        );
    });

    it('has no repeat part for a one-off reminder', () => {
        expect(buildReminderConfirmation({ ...input, repeat: 'none' })).toBe(
            '⏰ Reminder set: <b>Call &lt;bank&gt;</b>, Sat 31 Oct 2026, 09:00 (Europe/Paris)'
        );
    });

    it('adds the timezone hint only for UTC', () => {
        expect(buildReminderConfirmation({ ...input, timezone: 'UTC' })).toEndWith(
            '\nWrong zone? Use /timezone Area/City.'
        );
        expect(buildReminderConfirmation(input)).not.toContain('/timezone');
    });
});

describe('buildCancelConfirmation', () => {
    it('escapes the title', () => {
        expect(buildCancelConfirmation('a&b')).toBe('🗑 Cancelled: <b>a&amp;b</b>');
    });
});
