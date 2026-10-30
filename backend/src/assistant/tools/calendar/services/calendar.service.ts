import type { calendar_v3 } from '@googleapis/calendar';
import type { User } from '../../../../common/entities';
import type { CreatedReminder, CreateReminderInput, ReminderSummary } from './calendar.types';

import { injectable } from 'tsyringe';

import { NotFoundError } from '../../../../common/errors';
import { CALENDAR_EVENTS_SCOPE, GoogleAuthService } from '../../../../common/integrations';
import { type AppLogger, getAppLogger } from '../../../../common/logger';

import { CalendarApiFactory } from './calendar-api.factory';

const CALENDAR_ID = 'primary';
const SCOPES = [CALENDAR_EVENTS_SCOPE];
const TAG_KEY = 'tempo';
const TAG_VALUE = 'reminder';
const LIST_MAX_RESULTS = 20;
const LIST_MAX_PAGES = 10;

type Target = { kind: 'Event'; id?: string };

function errorStatus(error: unknown): number | undefined {
    const candidate = error as { response?: { status?: unknown }; status?: unknown; code?: unknown } | null;
    const status = candidate?.response?.status ?? candidate?.status ?? candidate?.code;
    return typeof status === 'number' ? status : undefined;
}

function isTagged(event: calendar_v3.Schema$Event): boolean {
    return event.extendedProperties?.private?.[TAG_KEY] === TAG_VALUE;
}

@injectable()
export class CalendarService {
    private readonly logger: AppLogger = getAppLogger(CalendarService.name);

    constructor(
        private readonly googleAuth: GoogleAuthService,
        private readonly apiFactory: CalendarApiFactory
    ) {}

    async createReminder(user: User, input: CreateReminderInput): Promise<CreatedReminder> {
        return this.call(user, {}, async (api) => {
            const { data } = await api.events.insert({
                calendarId: CALENDAR_ID,
                sendUpdates: 'none',
                requestBody: {
                    summary: input.title,
                    description: input.notes,
                    start: { dateTime: `${input.startLocal}:00`, timeZone: input.timezone },
                    end: { dateTime: `${input.endLocal}:00`, timeZone: input.timezone },
                    ...(input.recurrence ? { recurrence: [input.recurrence] } : {}),
                    visibility: 'private',
                    transparency: 'transparent',
                    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
                    extendedProperties: { private: { [TAG_KEY]: TAG_VALUE } },
                },
            });
            if (!data.id || !data.start?.dateTime) {
                throw new Error('Calendar returned an event without id or start time');
            }
            return { eventId: data.id, start: data.start.dateTime };
        });
    }

    async listReminders(user: User, now: Date): Promise<ReminderSummary[]> {
        return this.call(user, {}, async (api) => {
            const reminders: ReminderSummary[] = [];
            let pageToken: string | undefined;
            let pages = 0;
            do {
                const { data } = await api.events.list({
                    calendarId: CALENDAR_ID,
                    privateExtendedProperty: [`${TAG_KEY}=${TAG_VALUE}`],
                    timeMin: now.toISOString(),
                    singleEvents: false,
                    maxResults: LIST_MAX_RESULTS,
                    ...(pageToken ? { pageToken } : {}),
                });
                for (const event of data.items ?? []) {
                    const start = event.start?.dateTime ?? event.start?.date;
                    if (event.id && start) {
                        reminders.push({
                            eventId: event.id,
                            title: event.summary ?? '',
                            start,
                            recurrence: event.recurrence ?? null,
                        });
                    }
                }
                pageToken = data.nextPageToken ?? undefined;
                pages++;
            } while (pageToken && pages < LIST_MAX_PAGES);
            return reminders;
        });
    }

    async cancelReminder(user: User, eventId: string): Promise<{ title: string }> {
        return this.call(user, { kind: 'Event', id: eventId }, async (api) => {
            const { data } = await api.events.get({ calendarId: CALENDAR_ID, eventId });
            // Only events this bot created carry the tag; anything else (a meeting, say) is off limits.
            if (!isTagged(data)) {
                throw new NotFoundError(`Event ${eventId} not found`);
            }
            await api.events.delete({ calendarId: CALENDAR_ID, eventId, sendUpdates: 'none' });
            return { title: data.summary ?? '' };
        });
    }

    private async call<T>(
        user: User,
        target: Partial<Target>,
        run: (api: calendar_v3.Calendar) => Promise<T>
    ): Promise<T> {
        const auth = await this.googleAuth.getClient(user, SCOPES);
        const api = this.apiFactory.create(auth);
        try {
            return await run(api);
        } catch (error) {
            throw this.mapError(error, user, target);
        }
    }

    private mapError(error: unknown, user: User, target: Partial<Target>): unknown {
        if (error instanceof NotFoundError) {
            return error;
        }
        const status = errorStatus(error);
        if (status === undefined) {
            return new Error(error instanceof Error ? error.message : String(error));
        }
        this.logger.warn({ userId: user.id, id: target.id, status }, 'Calendar request failed');

        if ((status === 404 || status === 410) && target.kind) {
            return new NotFoundError(`${target.kind} ${target.id} not found`);
        }
        if (status === 429 || status >= 500) {
            return new Error(`Calendar is temporarily unavailable (${status})`);
        }
        return new Error(error instanceof Error ? error.message : `Calendar request failed (${status})`);
    }
}
