import type { gmail_v1 } from '@googleapis/gmail';
import type { User } from '../../../../../common/entities';
import type { GoogleAuthService } from '../../../../../common/integrations';

import { container } from 'tsyringe';

import { GoogleAuthErrorReason } from '../../../../../common/enums';
import { GoogleAuthError, NotFoundError } from '../../../../../common/errors';
import { GMAIL_COMPOSE_SCOPE, GMAIL_READ_SCOPE } from '../../../../../common/integrations';
import { createLogger } from '../../../../../common/logger';
import { createTestEnv } from '../../../../../common/tests/test-env';
import { LOGGER } from '../../../../../common/tokens';
import { type GmailApiFactory, GmailService } from '../../../../tools/gmail';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const user = { id: 'u1', name: 'alice' } as User;
const auth = { tag: 'oauth-client' };

function header(name: string, value: string) {
    return { name, value };
}

function metadataMessage(id: string, overrides: Record<string, unknown> = {}) {
    return {
        data: {
            id,
            threadId: `t-${id}`,
            snippet: 'short snippet',
            labelIds: ['INBOX'],
            payload: {
                headers: [
                    header('From', 'Alice <a@x.com>'),
                    header('To', 'me@x.com'),
                    header('Subject', `Subject ${id}`),
                    header('Date', 'Mon, 27 Oct 2026 10:00:00 +0000'),
                ],
            },
            ...overrides,
        },
    };
}

function fullMessage(id: string, text = 'Hello body') {
    const message = metadataMessage(id).data;
    return {
        data: {
            ...message,
            payload: {
                mimeType: 'text/plain',
                body: { data: Buffer.from(text, 'utf8').toString('base64url') },
                headers: [
                    ...message.payload.headers,
                    header('Cc', 'c@x.com'),
                    header('Reply-To', 'replies@x.com'),
                    header('Message-ID', `<${id}@x.com>`),
                    header('References', '<root@x.com>'),
                ],
            },
        },
    };
}

function apiError(status: number, message = 'api failed') {
    return Object.assign(new Error(message), { response: { status } });
}

function makeApi() {
    return {
        users: {
            messages: { list: mock(), get: mock() },
            threads: { get: mock() },
            drafts: { create: mock(), delete: mock(), send: mock() },
        },
    };
}

describe('GmailService', () => {
    const env = createTestEnv();
    let api: ReturnType<typeof makeApi>;
    let googleAuth: { getClient: ReturnType<typeof mock> };
    let service: GmailService;

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(env));
        api = makeApi();
        googleAuth = { getClient: mock(async () => auth) };
        const factory = { create: mock(() => api as unknown as gmail_v1.Gmail) };
        service = new GmailService(googleAuth as unknown as GoogleAuthService, factory as unknown as GmailApiFactory);
    });

    describe('scopes', () => {
        it('requests only the read scope for search, getMessage and getThread', async () => {
            api.users.messages.list.mockResolvedValue({ data: {} });
            api.users.messages.get.mockResolvedValue(fullMessage('m1'));
            api.users.threads.get.mockResolvedValue({ data: { messages: [] } });

            await service.search(user, 'q', 5);
            await service.getMessage(user, 'm1');
            await service.getThread(user, 't1');

            expect(googleAuth.getClient).toHaveBeenCalledTimes(3);
            for (const call of googleAuth.getClient.mock.calls) {
                expect(call).toEqual([user, [GMAIL_READ_SCOPE]]);
            }
        });

        it('requests read and compose for createDraft, deleteDraft and sendDraft', async () => {
            api.users.drafts.create.mockResolvedValue({ data: { id: 'd1', message: { id: 'm1' } } });
            api.users.drafts.delete.mockResolvedValue({});
            api.users.drafts.send.mockResolvedValue({});

            await service.createDraft(user, 'raw');
            await service.deleteDraft(user, 'd1');
            await service.sendDraft(user, 'd1');

            expect(googleAuth.getClient).toHaveBeenCalledTimes(3);
            for (const call of googleAuth.getClient.mock.calls) {
                expect(call).toEqual([user, [GMAIL_READ_SCOPE, GMAIL_COMPOSE_SCOPE]]);
            }
        });
    });

    describe('search', () => {
        it('lists ids then fetches metadata for each and maps summaries', async () => {
            api.users.messages.list.mockResolvedValue({ data: { messages: [{ id: 'm1' }, { id: 'm2' }] } });
            api.users.messages.get.mockImplementation(async ({ id }: { id: string }) =>
                id === 'm1'
                    ? metadataMessage('m1', { labelIds: ['INBOX', 'UNREAD'], snippet: 's'.repeat(300) })
                    : metadataMessage('m2')
            );

            const result = await service.search(user, 'from:alice', 2);

            expect(api.users.messages.list).toHaveBeenCalledWith({ userId: 'me', q: 'from:alice', maxResults: 2 });
            expect(api.users.messages.get).toHaveBeenCalledWith({
                userId: 'me',
                id: 'm1',
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Subject', 'Date'],
            });
            expect(result).toEqual([
                {
                    id: 'm1',
                    threadId: 't-m1',
                    from: 'Alice <a@x.com>',
                    to: 'me@x.com',
                    subject: 'Subject m1',
                    date: 'Mon, 27 Oct 2026 10:00:00 +0000',
                    snippet: 's'.repeat(200),
                    unread: true,
                },
                expect.objectContaining({ id: 'm2', unread: false, snippet: 'short snippet' }),
            ]);
        });

        it('returns an empty list without fetching anything', async () => {
            api.users.messages.list.mockResolvedValue({ data: {} });

            expect(await service.search(user, 'nothing', 10)).toEqual([]);
            expect(api.users.messages.get).not.toHaveBeenCalled();
        });
    });

    describe('getMessage', () => {
        it('maps headers and extracts the body', async () => {
            api.users.messages.get.mockResolvedValue(fullMessage('m1', 'Hello body'));

            const result = await service.getMessage(user, 'm1');

            expect(api.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'full' });
            expect(result).toMatchObject({
                id: 'm1',
                threadId: 't-m1',
                cc: 'c@x.com',
                replyTo: 'replies@x.com',
                messageIdHeader: '<m1@x.com>',
                references: '<root@x.com>',
                body: 'Hello body',
                truncated: false,
            });
        });

        it('cuts the body at maxBodyChars', async () => {
            api.users.messages.get.mockResolvedValue(fullMessage('m1', 'a'.repeat(50)));

            const result = await service.getMessage(user, 'm1', 10);

            expect(result.truncated).toBe(true);
            expect(result.body).toBe(`${'a'.repeat(10)} (truncated)`);
        });
    });

    describe('getThread', () => {
        it('returns only the last 10 messages', async () => {
            const messages = Array.from({ length: 12 }, (_, i) => fullMessage(`m${i}`).data);
            api.users.threads.get.mockResolvedValue({ data: { messages } });

            const result = await service.getThread(user, 't1');

            expect(api.users.threads.get).toHaveBeenCalledWith({ userId: 'me', id: 't1', format: 'full' });
            expect(result.map((m) => m.id)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i + 2}`));
        });
    });

    describe('createDraft', () => {
        it('creates the draft, in the thread when given, and returns the ids', async () => {
            api.users.drafts.create.mockResolvedValue({ data: { id: 'd1', message: { id: 'm9' } } });

            const result = await service.createDraft(user, 'raw-mime', 't1');

            expect(api.users.drafts.create).toHaveBeenCalledWith({
                userId: 'me',
                requestBody: { message: { raw: 'raw-mime', threadId: 't1' } },
            });
            expect(result).toEqual({ draftId: 'd1', messageId: 'm9' });
        });
    });

    describe('sendDraft and deleteDraft', () => {
        it('sends the draft by id', async () => {
            api.users.drafts.send.mockResolvedValue({});

            await service.sendDraft(user, 'd1');

            expect(api.users.drafts.send).toHaveBeenCalledWith({ userId: 'me', requestBody: { id: 'd1' } });
        });

        it('deletes the draft by id and ignores a 404', async () => {
            api.users.drafts.delete.mockRejectedValue(apiError(404));

            await expect(service.deleteDraft(user, 'd1')).resolves.toBeUndefined();
            expect(api.users.drafts.delete).toHaveBeenCalledWith({ userId: 'me', id: 'd1' });
        });

        it('still surfaces other delete errors', async () => {
            api.users.drafts.delete.mockRejectedValue(apiError(503));

            await expect(service.deleteDraft(user, 'd1')).rejects.toThrow('Gmail is temporarily unavailable (503)');
        });
    });

    describe('error mapping', () => {
        it('maps 404 to NotFoundError for a message and for a draft', async () => {
            api.users.messages.get.mockRejectedValue(apiError(404));
            api.users.drafts.send.mockRejectedValue(apiError(404));

            const message = await service.getMessage(user, 'm1').catch((error: unknown) => error);
            const draft = await service.sendDraft(user, 'd1').catch((error: unknown) => error);

            expect(message).toBeInstanceOf(NotFoundError);
            expect((message as Error).message).toBe('Message m1 not found');
            expect(draft).toBeInstanceOf(NotFoundError);
            expect((draft as Error).message).toBe('Draft d1 not found');
        });

        it('maps 429 and 5xx to a temporary-unavailable error', async () => {
            api.users.messages.list.mockRejectedValueOnce(apiError(429));
            api.users.messages.list.mockRejectedValueOnce(apiError(503));

            await expect(service.search(user, 'q', 1)).rejects.toThrow('Gmail is temporarily unavailable (429)');
            await expect(service.search(user, 'q', 1)).rejects.toThrow('Gmail is temporarily unavailable (503)');
        });

        it("passes Gmail's own message through for a 400", async () => {
            api.users.messages.list.mockRejectedValue(apiError(400, 'Invalid query'));

            await expect(service.search(user, 'bad:::', 1)).rejects.toThrow('Invalid query');
        });

        it('falls back to status or code when there is no response', async () => {
            api.users.messages.list.mockRejectedValue(Object.assign(new Error('x'), { code: 503 }));

            await expect(service.search(user, 'q', 1)).rejects.toThrow('Gmail is temporarily unavailable (503)');
        });

        it('rethrows a GoogleAuthError from getClient unchanged', async () => {
            const failure = new GoogleAuthError(GoogleAuthErrorReason.NOT_CONNECTED, 'Connect Google first');
            googleAuth.getClient.mockRejectedValue(failure);

            await expect(service.search(user, 'q', 1)).rejects.toBe(failure);
            expect(api.users.messages.list).not.toHaveBeenCalled();
        });

        it('throws a fresh error that carries no request data for 400 and unmapped statuses', async () => {
            const original = Object.assign(new Error('Invalid To header'), {
                response: { status: 400 },
                config: { body: 'secret-base64-mime', url: 'q=from:secret@x.com' },
            });
            api.users.drafts.create.mockRejectedValueOnce(original);
            api.users.messages.list.mockRejectedValueOnce(
                Object.assign(new Error('Forbidden'), { response: { status: 403 }, config: { body: 'secret' } })
            );

            const bad = await service.createDraft(user, 'raw').catch((error: unknown) => error);
            const forbidden = await service.search(user, 'q', 1).catch((error: unknown) => error);

            for (const [thrown, message] of [
                [bad, 'Invalid To header'],
                [forbidden, 'Forbidden'],
            ] as const) {
                expect(thrown).not.toBe(original);
                expect((thrown as Error).message).toBe(message);
                expect(thrown).not.toHaveProperty('config');
                expect(thrown).not.toHaveProperty('response');
            }
        });

        it('throws a fresh error that carries no request data for errors without a status', async () => {
            const failure = Object.assign(new Error('socket hang up'), {
                code: 'ECONNRESET',
                config: { data: { message: { raw: 'secret-base64-mime' } } },
            });
            api.users.messages.list.mockRejectedValue(failure);

            const thrown = await service.search(user, 'q', 1).catch((error: unknown) => error);

            expect((thrown as Error).message).toBe('socket hang up');
            expect(thrown).not.toBe(failure);
            expect(thrown).not.toHaveProperty('config');
        });
    });

    describe('hasCorrespondedWith', () => {
        it('looks only at mail the user sent and is true iff a message is found', async () => {
            api.users.messages.list.mockResolvedValueOnce({ data: { messages: [{ id: 'm1' }] } });
            api.users.messages.list.mockResolvedValueOnce({ data: {} });

            expect(await service.hasCorrespondedWith(user, 'a@x.com')).toBe(true);
            expect(await service.hasCorrespondedWith(user, 'a@x.com')).toBe(false);
            expect(api.users.messages.list).toHaveBeenCalledWith({
                userId: 'me',
                q: 'in:sent (to:"a@x.com" OR cc:"a@x.com" OR bcc:"a@x.com")',
                maxResults: 1,
            });
        });
    });
});
