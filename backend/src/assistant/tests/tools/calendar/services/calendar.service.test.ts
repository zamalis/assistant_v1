import type { calendar_v3 } from '@googleapis/calendar';
import type { User } from '../../../../../common/entities';
import type { GoogleAuthService } from '../../../../../common/integrations';

import { container } from 'tsyringe';

import { GoogleAuthErrorReason } from '../../../../../common/enums';
import { GoogleAuthError, NotFoundError } from '../../../../../common/errors';
import { CALENDAR_EVENTS_SCOPE } from '../../../../../common/integrations';
import { createLogger } from '../../../../../common/logger';
import { createTestEnv } from '../../../../../common/tests/test-env';
import { LOGGER } from '../../../../../common/tokens';
import { type CalendarApiFactory, CalendarService } from '../../../../tools/calendar';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const user = { id: 'u1' } as User;
const auth = { tag: 'oauth-client' };
const NOW = new Date('2026-10-30T12:00:00Z');
const input = {
    title: 'Call bank',
    notes: 'ask about the fee',
    startLocal: '2026-10-31T09:00',
    endLocal: '2026-10-31T09:15',
    timezone: 'Europe/Paris',
    recurrence: 'RRULE:FREQ=WEEKLY',
};

function apiError(status: number) {
    return Object.assign(new Error('api failed'), { response: { status } });
}

function makeApi() {
    return { events: { insert: mock(), list: mock(), get: mock(), delete: mock() } };
}

describe('CalendarService', () => {
    const env = createTestEnv();
    let api: ReturnType<typeof makeApi>;
    let googleAuth: { getClient: ReturnType<typeof mock> };
    let service: CalendarService;

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(env));
        api = makeApi();
        googleAuth = { getClient: mock(async () => auth) };
        const factory = { create: mock(() => api as unknown as calendar_v3.Calendar) };
        service = new CalendarService(
            googleAuth as unknown as GoogleAuthService,
            factory as unknown as CalendarApiFactory
        );
    });

    describe('createReminder', () => {
        beforeEach(() => {
            api.events.insert.mockResolvedValue({
                data: { id: 'e1', start: { dateTime: '2026-10-31T09:00:00+01:00' } },
            });
        });

        it('inserts a private, popup-only, tagged event with no attendees', async () => {
            const created = await service.createReminder(user, input);

            expect(googleAuth.getClient).toHaveBeenCalledWith(user, [CALENDAR_EVENTS_SCOPE]);
            expect(created).toEqual({ eventId: 'e1', start: '2026-10-31T09:00:00+01:00' });
            const call = api.events.insert.mock.calls[0]?.[0] as {
                calendarId: string;
                sendUpdates: string;
                requestBody: Record<string, unknown>;
            };
            expect(call.calendarId).toBe('primary');
            expect(call.sendUpdates).toBe('none');
            expect(call.requestBody).toEqual({
                summary: 'Call bank',
                description: 'ask about the fee',
                start: { dateTime: '2026-10-31T09:00:00', timeZone: 'Europe/Paris' },
                end: { dateTime: '2026-10-31T09:15:00', timeZone: 'Europe/Paris' },
                recurrence: ['RRULE:FREQ=WEEKLY'],
                visibility: 'private',
                transparency: 'transparent',
                reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
                extendedProperties: { private: { tempo: 'reminder' } },
            });
            expect('attendees' in call.requestBody).toBe(false);
        });

        it('omits recurrence for a one-off reminder', async () => {
            await service.createReminder(user, { ...input, recurrence: null });

            const call = api.events.insert.mock.calls[0]?.[0] as { requestBody: Record<string, unknown> };
            expect('recurrence' in call.requestBody).toBe(false);
        });

        it('fails when Calendar returns no id', async () => {
            api.events.insert.mockResolvedValue({ data: {} });

            await expect(service.createReminder(user, input)).rejects.toThrow(
                'Calendar returned an event without id or start time'
            );
        });
    });

    describe('listReminders', () => {
        it('queries only tagged events from now and maps the items', async () => {
            api.events.list.mockResolvedValue({
                data: {
                    items: [
                        {
                            id: 'e1',
                            summary: 'A',
                            start: { dateTime: '2026-10-31T09:00:00+01:00' },
                            recurrence: ['RRULE:FREQ=DAILY'],
                        },
                        { id: 'e2', summary: 'B', start: { dateTime: '2026-11-01T09:00:00+01:00' } },
                        { summary: 'no id', start: { dateTime: '2026-11-01T09:00:00+01:00' } },
                    ],
                },
            });

            const result = await service.listReminders(user, NOW);

            expect(api.events.list).toHaveBeenCalledWith({
                calendarId: 'primary',
                privateExtendedProperty: ['tempo=reminder'],
                timeMin: '2026-10-30T12:00:00.000Z',
                singleEvents: false,
                maxResults: 20,
            });
            expect(result).toEqual([
                { eventId: 'e1', title: 'A', start: '2026-10-31T09:00:00+01:00', recurrence: ['RRULE:FREQ=DAILY'] },
                { eventId: 'e2', title: 'B', start: '2026-11-01T09:00:00+01:00', recurrence: null },
            ]);
        });

        it('follows nextPageToken so no reminder is silently dropped', async () => {
            const item = (id: string) => ({ id, summary: id, start: { dateTime: '2026-10-31T09:00:00+01:00' } });
            api.events.list
                .mockResolvedValueOnce({ data: { items: [item('e1')], nextPageToken: 'p2' } })
                .mockResolvedValueOnce({ data: { items: [item('e2')] } });

            const result = await service.listReminders(user, NOW);

            expect(result.map((r) => r.eventId)).toEqual(['e1', 'e2']);
            expect(api.events.list).toHaveBeenCalledTimes(2);
            expect(api.events.list.mock.calls[1]?.[0]).toMatchObject({ pageToken: 'p2' });
        });

        it('returns an empty list when there are no items', async () => {
            api.events.list.mockResolvedValue({ data: {} });

            await expect(service.listReminders(user, NOW)).resolves.toEqual([]);
        });
    });

    describe('cancelReminder', () => {
        it('deletes a tagged event without notifying anyone', async () => {
            api.events.get.mockResolvedValue({
                data: { id: 'e1', summary: 'Call bank', extendedProperties: { private: { tempo: 'reminder' } } },
            });
            api.events.delete.mockResolvedValue({});

            await expect(service.cancelReminder(user, 'e1')).resolves.toEqual({ title: 'Call bank' });

            expect(api.events.delete).toHaveBeenCalledWith({
                calendarId: 'primary',
                eventId: 'e1',
                sendUpdates: 'none',
            });
        });

        it('refuses an event without the tag and does not delete it', async () => {
            api.events.get.mockResolvedValue({ data: { id: 'm1', summary: 'Team meeting' } });

            await expect(service.cancelReminder(user, 'm1')).rejects.toBeInstanceOf(NotFoundError);
            expect(api.events.delete).not.toHaveBeenCalled();
        });

        it('maps a 410 (already deleted) to NotFoundError', async () => {
            api.events.get.mockResolvedValue({
                data: { id: 'e1', summary: 'Gone', extendedProperties: { private: { tempo: 'reminder' } } },
            });
            api.events.delete.mockRejectedValue(apiError(410));

            await expect(service.cancelReminder(user, 'e1')).rejects.toBeInstanceOf(NotFoundError);
        });

        it('maps a 404 to NotFoundError', async () => {
            api.events.get.mockRejectedValue(apiError(404));

            await expect(service.cancelReminder(user, 'gone')).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe('errors', () => {
        it.each([429, 503])('maps %d to a temporary-unavailable error', async (status) => {
            api.events.list.mockRejectedValue(apiError(status));

            await expect(service.listReminders(user, NOW)).rejects.toThrow(
                `Calendar is temporarily unavailable (${status})`
            );
        });

        it('lets a GoogleAuthError through unchanged', async () => {
            const error = new GoogleAuthError(GoogleAuthErrorReason.NOT_CONNECTED, 'Connect Google first');
            googleAuth.getClient.mockRejectedValue(error);

            await expect(service.listReminders(user, NOW)).rejects.toBe(error);
        });
    });
});
