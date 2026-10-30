import { addMinutesLocal, canonicalTimezone, toEventTimes, toLocalDateTime } from '../../../../tools/calendar';

import { describe, expect, it } from 'bun:test';

const NOW = new Date('2026-10-30T12:00:00Z');

describe('toEventTimes', () => {
    it('converts Paris wall time to an instant', () => {
        const times = toEventTimes('2026-10-31T09:00', 'Europe/Paris', NOW);

        expect(times.startInstant.toISOString()).toBe('2026-10-31T08:00:00.000Z');
        expect(times.startLocal).toBe('2026-10-31T09:00');
        expect(times.endLocal).toBe('2026-10-31T09:15');
    });

    it('converts New York wall time after the US DST end', () => {
        const times = toEventTimes('2026-11-02T09:00', 'America/New_York', NOW);

        expect(times.startInstant.toISOString()).toBe('2026-11-02T14:00:00.000Z');
    });

    it('rejects a time in the past and names the local now', () => {
        const now = new Date('2026-10-31T08:00:30Z');

        expect(() => toEventTimes('2026-10-31T09:00', 'Europe/Paris', now)).toThrow(/in the past \(now: /);
        expect(() => toEventTimes('2026-10-31T09:00', 'Europe/Paris', now)).toThrow('now: 2026-10-31 09:00)');
    });

    it('rejects a local time skipped by a DST change', () => {
        expect(() => toEventTimes('2026-03-29T02:30', 'Europe/Paris', new Date('2026-01-10T00:00:00Z'))).toThrow(
            '2026-03-29T02:30 does not exist in Europe/Paris (daylight saving change). Pick another time.'
        );
    });

    it('resolves an ambiguous local time to the earlier instant', () => {
        const times = toEventTimes('2026-10-25T02:30', 'Europe/Paris', new Date('2026-01-10T00:00:00Z'));

        expect(times.startInstant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    });

    it('rolls the end over to the next day instead of producing 24:05', () => {
        const times = toEventTimes('2026-10-31T23:50', 'Europe/Paris', NOW);

        expect(times.endLocal).toBe('2026-11-01T00:05');
    });

    it('accepts one minute ahead and rejects the current minute', () => {
        const now = new Date('2026-10-31T08:00:30Z');

        expect(toEventTimes('2026-10-31T09:01', 'Europe/Paris', now).startLocal).toBe('2026-10-31T09:01');
        expect(() => toEventTimes('2026-10-31T09:00', 'Europe/Paris', now)).toThrow('in the past');
    });
});

describe('canonicalTimezone', () => {
    it('trims and fixes the case', () => {
        expect(canonicalTimezone(' europe/paris ')).toBe('Europe/Paris');
    });

    it.each(['+05:30', '-03', '+0530'])(
        'rejects the UTC-offset form %s that Google Calendar does not accept',
        (value) => {
            expect(canonicalTimezone(value)).toBeNull();
        }
    );

    it('returns null for an unknown zone', () => {
        expect(canonicalTimezone('Mars/Base')).toBeNull();
    });
});

describe('toLocalDateTime', () => {
    it('formats wall time in the zone', () => {
        expect(toLocalDateTime(new Date('2026-10-31T08:00:00Z'), 'Europe/Paris')).toBe('2026-10-31T09:00');
    });
});

describe('addMinutesLocal', () => {
    it('does wall-clock arithmetic across midnight', () => {
        expect(addMinutesLocal('2026-12-31T23:50', 15)).toBe('2027-01-01T00:05');
    });
});
