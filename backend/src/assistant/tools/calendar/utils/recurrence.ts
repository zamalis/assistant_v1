import type { RepeatValue } from '../../../schemas';

import { addMinutesLocal } from './event-times';

const WEEKDAY_RULE = 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
const RULES: Record<Exclude<RepeatValue, 'none'>, string> = {
    daily: 'RRULE:FREQ=DAILY',
    weekdays: WEEKDAY_RULE,
    weekly: 'RRULE:FREQ=WEEKLY',
    monthly: 'RRULE:FREQ=MONTHLY',
};
const MONTHLY_MAX_DAY = 28;
const MINUTES_PER_DAY = 24 * 60;

function fields(localDateTime: string): [number, number, number, number, number] {
    return localDateTime.split(/[-T:]/).map(Number) as [number, number, number, number, number];
}

function isWeekend(localDateTime: string): boolean {
    const [year, month, day] = fields(localDateTime);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday === 0 || weekday === 6;
}

export function buildRecurrence(repeat: RepeatValue, startLocal: string): string | null {
    if (repeat === 'none') {
        return null;
    }
    if (repeat === 'weekdays' && isWeekend(startLocal)) {
        throw new Error('Weekday reminders must start on a weekday.');
    }
    if (repeat === 'monthly' && fields(startLocal)[2] > MONTHLY_MAX_DAY) {
        throw new Error(`Monthly reminders must be on day 1-${MONTHLY_MAX_DAY}.`);
    }
    return RULES[repeat];
}

export function parseRepeat(recurrence: string[] | null | undefined): RepeatValue {
    const rule = recurrence?.length === 1 ? recurrence[0] : undefined;
    const match = (Object.entries(RULES) as [Exclude<RepeatValue, 'none'>, string][]).find(([, r]) => r === rule);
    return match?.[0] ?? 'none';
}

/** First occurrence strictly after `nowLocal`, as wall-clock strings, which compare chronologically. */
export function nextOccurrence(startLocal: string, repeat: RepeatValue, nowLocal: string): string {
    if (repeat === 'none' || startLocal > nowLocal) {
        return startLocal;
    }

    if (repeat === 'monthly') {
        const [year, month, day, hour, minute] = fields(startLocal);
        for (let step = 1; ; step++) {
            const candidate = new Date(Date.UTC(year, month - 1 + step, day, hour, minute)).toISOString().slice(0, 16);
            if (candidate > nowLocal) {
                return candidate;
            }
        }
    }

    const stepDays = repeat === 'weekly' ? 7 : 1;
    let candidate = startLocal;
    do {
        candidate = addMinutesLocal(candidate, stepDays * MINUTES_PER_DAY);
    } while (candidate <= nowLocal || (repeat === 'weekdays' && isWeekend(candidate)));
    return candidate;
}
