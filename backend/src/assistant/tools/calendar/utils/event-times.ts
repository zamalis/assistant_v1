const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const EVENT_DURATION_MINUTES = 15;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

export type EventTimes = { startLocal: string; endLocal: string; startInstant: Date };

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallClock(instantMs: number, timezone: string): WallClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(instantMs);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
    return {
        year: value('year'),
        month: value('month'),
        day: value('day'),
        hour: value('hour'),
        minute: value('minute'),
        second: value('second'),
    };
}

function pad(value: number, length = 2): string {
    return String(value).padStart(length, '0');
}

function formatLocal(clock: Pick<WallClock, 'year' | 'month' | 'day' | 'hour' | 'minute'>): string {
    return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(clock.minute)}`;
}

/** Milliseconds to add to a UTC instant to get the wall clock in `timezone` (read as if it were UTC). */
function offsetAt(instantMs: number, timezone: string): number {
    const c = wallClock(instantMs, timezone);
    return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - Math.floor(instantMs / 1000) * 1000;
}

export function canonicalTimezone(value: string): string | null {
    const trimmed = value.trim();
    // Intl accepts UTC-offset zones like "+05:30", but Google Calendar only takes IANA names.
    if (/^[+-]/.test(trimmed)) {
        return null;
    }
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions().timeZone;
    } catch (error) {
        if (error instanceof RangeError) {
            return null;
        }
        throw error;
    }
}

export function toLocalDateTime(instant: Date, timezone: string): string {
    return formatLocal(wallClock(instant.getTime(), timezone));
}

export function addMinutesLocal(localDateTime: string, minutes: number): string {
    const match = LOCAL_DATE_TIME.exec(localDateTime);
    if (!match) {
        throw new Error(`Invalid local date-time "${localDateTime}"`);
    }
    const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
    const shifted = new Date(Date.UTC(year, month - 1, day, hour, minute) + minutes * MS_PER_MINUTE);
    return shifted.toISOString().slice(0, 16);
}

export function toEventTimes(localDateTime: string, timezone: string, now: Date): EventTimes {
    const match = LOCAL_DATE_TIME.exec(localDateTime);
    if (!match) {
        throw new Error(`Invalid local date-time "${localDateTime}"`);
    }
    const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
    const guess = Date.UTC(year, month - 1, day, hour, minute);

    // The zone's offset can differ a day either side of a DST change, so both are tried and verified by round trip.
    const offsets = new Set([offsetAt(guess - MS_PER_DAY, timezone), offsetAt(guess + MS_PER_DAY, timezone)]);
    const candidates = [...offsets]
        .map((offset) => guess - offset)
        .filter((instant) => toLocalDateTime(new Date(instant), timezone) === localDateTime);
    if (candidates.length === 0) {
        throw new Error(`${localDateTime} does not exist in ${timezone} (daylight saving change). Pick another time.`);
    }

    const startInstant = new Date(Math.min(...candidates));
    if (startInstant.getTime() <= now.getTime()) {
        throw new Error(`That time is in the past (now: ${toLocalDateTime(now, timezone).replace('T', ' ')}).`);
    }

    return {
        startLocal: localDateTime,
        endLocal: addMinutesLocal(localDateTime, EVENT_DURATION_MINUTES),
        startInstant,
    };
}
