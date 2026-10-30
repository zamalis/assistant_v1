import type { RepeatValue } from '../../../schemas';

import { escapeHtml } from '../../gmail/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REPEAT_TEXT: Record<RepeatValue, string | null> = {
    none: null,
    daily: 'repeats daily',
    weekdays: 'repeats on weekdays',
    weekly: 'repeats weekly',
    monthly: 'repeats monthly',
};

export type ReminderConfirmationInput = { title: string; startLocal: string; timezone: string; repeat: RepeatValue };

export function describeRepeat(repeat: RepeatValue): string | null {
    return REPEAT_TEXT[repeat];
}

function formatWhen(startLocal: string): string {
    const [year, month, day] = startLocal.split(/[-T:]/).map(Number) as [number, number, number];
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return `${weekday} ${day} ${MONTHS[month - 1]} ${year}, ${startLocal.slice(11, 16)}`;
}

export function buildReminderConfirmation({ title, startLocal, timezone, repeat }: ReminderConfirmationInput): string {
    const repeatText = describeRepeat(repeat);
    const line = [
        `⏰ Reminder set: <b>${escapeHtml(title)}</b>`,
        `${formatWhen(startLocal)} (${timezone})`,
        ...(repeatText ? [repeatText] : []),
    ].join(', ');
    return timezone === 'UTC' ? `${line}\nWrong zone? Use /timezone Area/City.` : line;
}

export function buildCancelConfirmation(title: string): string {
    return `🗑 Cancelled: <b>${escapeHtml(title)}</b>`;
}
