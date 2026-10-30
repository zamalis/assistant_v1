import type { User } from '../../../common/entities/user.entity';
import type { Message } from '../../entities/message.entity';

import { MessageRole } from '../../enums';
import { MessageRepository } from '../../repositories/message.repository';
import { MessageService } from '../../services/message.service';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeUser(): User {
    return {
        id: USER_ID,
        name: 'gaby',
        telegramId: null,
        isAllowed: true,
        timezone: 'UTC',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        messages: [],
    };
}

function makeMessage(overrides: Partial<Message> & Pick<Message, 'role' | 'content'>): Message {
    return {
        id: 'msg-1',
        userId: USER_ID,
        toolCalls: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        user: makeUser(),
        ...overrides,
    };
}

describe('MessageService', () => {
    let messageRepository: {
        find: ReturnType<typeof mock>;
        delete: ReturnType<typeof mock>;
        save: ReturnType<typeof mock>;
        create: ReturnType<typeof mock>;
    };
    let service: MessageService;

    beforeEach(() => {
        messageRepository = {
            find: mock(() => Promise.resolve([])),
            delete: mock(() => Promise.resolve()),
            save: mock(() => Promise.resolve()),
            create: mock((input: unknown) => input),
        };
        service = new MessageService(messageRepository as unknown as MessageRepository);
    });

    it('loads the latest messages oldest first', async () => {
        const newestFirst = [
            makeMessage({ id: 'm1', role: MessageRole.ASSISTANT, content: 'hi' }),
            makeMessage({ id: 'm0', role: MessageRole.USER, content: 'hello' }),
        ];
        messageRepository.find.mockImplementation(() => Promise.resolve(newestFirst));

        await expect(service.getMessages(USER_ID)).resolves.toEqual([newestFirst[1], newestFirst[0]]);
        expect(messageRepository.find).toHaveBeenCalledWith({
            where: { userId: USER_ID },
            order: { createdAt: 'DESC' },
            take: 40,
        });
    });

    it('saves the user turn and the assistant reply together', async () => {
        await service.saveMessages(USER_ID, 'hello', 'pong');

        const saved = messageRepository.save.mock.calls[0]?.[0] as Array<{
            userId: string;
            role: MessageRole;
            content: string;
            createdAt: Date;
        }>;

        expect(saved[0]).toMatchObject({
            userId: USER_ID,
            role: MessageRole.USER,
            content: 'hello',
        });
        expect(saved[1]).toMatchObject({
            userId: USER_ID,
            role: MessageRole.ASSISTANT,
            content: 'pong',
        });
        expect(saved[1].createdAt.getTime() - saved[0].createdAt.getTime()).toBe(1);
    });

    it('saves tool calls on the assistant row', async () => {
        const toolCalls = [{ id: 'call_1', name: 'search_emails', args: { query: 'x' }, digest: [{ id: 'm1' }] }];

        await service.saveMessages(USER_ID, 'hi', 'hello', toolCalls);

        const saved = messageRepository.save.mock.calls[0]?.[0] as Array<Record<string, unknown>>;

        expect(saved[1]).toMatchObject({ role: MessageRole.ASSISTANT, toolCalls });
        expect(saved[0]).not.toHaveProperty('toolCalls');
    });

    it('stores null tool calls when none are given', async () => {
        await service.saveMessages(USER_ID, 'hi', 'hello');

        const saved = messageRepository.save.mock.calls[0]?.[0] as Array<Record<string, unknown>>;

        expect(saved[1]).toMatchObject({ role: MessageRole.ASSISTANT, toolCalls: null });
    });

    it('reset deletes that user messages', async () => {
        await service.reset(USER_ID);

        expect(messageRepository.delete).toHaveBeenCalledWith({ userId: USER_ID });
    });
});
