import { buildRecurrence, nextOccurrence, parseRepeat } from '../../../../tools/calendar';

import { describe, expect, it } from 'bun:test';

describe('buildRecurrence', () => {
    it('maps each repeat to its rule', () => {
        expect(buildRecurrence('none', '2026-10-30T09:00')).toBeNull();
        expect(buildRecurrence('daily', '2026-10-30T09:00')).toBe('RRULE:FREQ=DAILY');
        expect(buildRecurrence('weekly', '2026-10-30T09:00')).toBe('RRULE:FREQ=WEEKLY');
        expect(buildRecurrence('weekdays', '2026-10-30T09:00')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        expect(buildRecurrence('monthly', '2026-10-28T09:00')).toBe('RRULE:FREQ=MONTHLY');
    });

    it('rejects a weekday series starting on a Saturday or Sunday', () => {
        expect(() => buildRecurrence('weekdays', '2026-10-31T09:00')).toThrow(
            'Weekday reminders must start on a weekday.'
        );
        expect(() => buildRecurrence('weekdays', '2026-11-01T09:00')).toThrow(
            'Weekday reminders must start on a weekday.'
        );
    });

    it('rejects a monthly series on day 29 or later', () => {
        expect(() => buildRecurrence('monthly', '2026-10-29T09:00')).toThrow('Monthly reminders must be on day 1-28.');
        expect(() => buildRecurrence('monthly', '2026-10-31T09:00')).toThrow('Monthly reminders must be on day 1-28.');
    });
});

describe('parseRepeat', () => {
    it.each(['daily', 'weekdays', 'weekly', 'monthly'] as const)('round-trips %s', (repeat) => {
        const rule = buildRecurrence(repeat, '2026-10-26T09:00');

        expect(parseRepeat(rule ? [rule] : null)).toBe(repeat);
    });

    it('falls back to none for unknown or missing rules', () => {
        expect(parseRepeat(['RRULE:FREQ=YEARLY'])).toBe('none');
        expect(parseRepeat(null)).toBe('none');
        expect(parseRepeat(undefined)).toBe('none');
        expect(parseRepeat([])).toBe('none');
    });
});

describe('nextOccurrence', () => {
    it('steps a daily series to the next day', () => {
        expect(nextOccurrence('2026-10-01T09:00', 'daily', '2026-10-30T10:00')).toBe('2026-10-31T09:00');
    });

    it('keeps today when the time is still ahead', () => {
        expect(nextOccurrence('2026-10-01T09:00', 'daily', '2026-10-30T08:00')).toBe('2026-10-30T09:00');
    });

    it('skips the weekend for weekdays', () => {
        expect(nextOccurrence('2026-10-30T09:00', 'weekdays', '2026-10-30T10:00')).toBe('2026-11-02T09:00');
    });

    it('steps weekly by seven days', () => {
        expect(nextOccurrence('2026-10-01T09:00', 'weekly', '2026-10-30T10:00')).toBe('2026-11-05T09:00');
    });

    it('rolls a monthly series into the next year', () => {
        expect(nextOccurrence('2026-11-15T09:00', 'monthly', '2026-12-20T08:00')).toBe('2027-01-15T09:00');
    });

    it('returns the start of a one-off reminder unchanged', () => {
        expect(nextOccurrence('2026-10-01T09:00', 'none', '2026-10-30T10:00')).toBe('2026-10-01T09:00');
    });
});
