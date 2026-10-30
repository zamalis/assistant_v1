import type { User } from '../../../common/entities/user.entity';
import type {
    ChatService,
    LangchainService,
    OutgoingMessage,
    ProviderIncoming,
    ToolCallDigest,
    ToolRegistry,
} from '../../../common/integrations';
import type { CommandRouter } from '../../commands/command-router';
import type { Message } from '../../entities/message.entity';

import { container } from 'tsyringe';

import { createLogger } from '../../../common/logger';
import { UserRepository } from '../../../common/repositories/user.repository';
import { createTestEnv } from '../../../common/tests/test-env';
import { LOGGER } from '../../../common/tokens';
import { MessageRole } from '../../enums';
import { AssistantService } from '../../services/assistant.service';
import { MessageService } from '../../services/message.service';

import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

const TELEGRAM_USER_ID = '7';
const CHAT_ID = '42';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PRIVATE_REPLY = 'This bot is private.';
const FAILED_REPLY = 'I could not answer that. Please try again.';

type AssistantHarness = {
    handleUserMessage(incoming: ProviderIncoming): Promise<void>;
};

function asHarness(service: AssistantService): AssistantHarness {
    return service as unknown as AssistantHarness;
}

function incoming(overrides: Partial<ProviderIncoming> = {}): ProviderIncoming {
    return {
        providerUserId: TELEGRAM_USER_ID,
        chatId: CHAT_ID,
        kind: 'text',
        text: 'hello',
        ...overrides,
    } as ProviderIncoming;
}

function command(name: string, args = ''): ProviderIncoming {
    return { providerUserId: TELEGRAM_USER_ID, chatId: CHAT_ID, kind: 'command', command: name, args };
}

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: USER_ID,
        name: 'gaby',
        telegramId: TELEGRAM_USER_ID,
        isAllowed: true,
        timezone: 'UTC',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        messages: [],
        ...overrides,
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

describe('AssistantService', () => {
    const env = createTestEnv({ OPENAI_API_KEY: 'sk-test' });
    let userRepository: { findOneBy: ReturnType<typeof mock> };
    let messageService: {
        saveMessages: ReturnType<typeof mock>;
        getMessages: ReturnType<typeof mock>;
    };
    let commandRouter: { handle: ReturnType<typeof mock> };
    let langchainService: { runAgent: ReturnType<typeof mock> };
    let toolRegistry: { buildTools: ReturnType<typeof mock> };
    const tools = [{ name: 'get_current_time' }];
    let chatService: {
        start: ReturnType<typeof mock>;
        stop: ReturnType<typeof mock>;
        sendMessage: ReturnType<typeof mock>;
        getAllowedUserFilter: ReturnType<typeof mock>;
    };
    let service: AssistantService;
    let harness: AssistantHarness;

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(env));
        userRepository = {
            findOneBy: mock(() => Promise.resolve(makeUser())),
        };
        messageService = {
            saveMessages: mock(() => Promise.resolve()),
            getMessages: mock(() =>
                Promise.resolve([makeMessage({ id: 'm0', role: MessageRole.ASSISTANT, content: 'prior' })])
            ),
        };
        commandRouter = { handle: mock(() => Promise.resolve('command reply')) };
        langchainService = { runAgent: mock(() => Promise.resolve({ text: 'pong', toolCalls: [] })) };
        toolRegistry = { buildTools: mock(() => tools) };
        chatService = {
            start: mock(() => Promise.resolve()),
            stop: mock(() => Promise.resolve()),
            sendMessage: mock(() => Promise.resolve()),
            getAllowedUserFilter: mock((providerUserId: string) => ({ telegramId: providerUserId, isAllowed: true })),
        };
        service = new AssistantService(
            chatService as unknown as ChatService,
            messageService as unknown as MessageService,
            langchainService as unknown as LangchainService,
            userRepository as unknown as UserRepository,
            toolRegistry as unknown as ToolRegistry,
            commandRouter as unknown as CommandRouter
        );
        harness = asHarness(service);
    });

    it('starts the chat provider with its own message handler', async () => {
        await service.start();

        expect(chatService.start).toHaveBeenCalledTimes(1);
    });

    it('stops the chat provider', async () => {
        await service.stop();

        expect(chatService.stop).toHaveBeenCalledTimes(1);
    });

    it('asks langchain with history plus the new turn, then saves both and sends the reply', async () => {
        await harness.handleUserMessage(incoming());

        expect(chatService.getAllowedUserFilter).toHaveBeenCalledWith(TELEGRAM_USER_ID);
        expect(userRepository.findOneBy).toHaveBeenCalledWith({ telegramId: TELEGRAM_USER_ID, isAllowed: true });
        expect(messageService.getMessages).toHaveBeenCalledWith(USER_ID);
        expect(langchainService.runAgent).toHaveBeenCalledWith(
            {
                systemPrompt: expect.any(String),
                messages: [
                    { role: 'assistant', content: 'prior' },
                    { role: 'user', content: 'hello' },
                ],
            },
            tools
        );
        expect(messageService.saveMessages).toHaveBeenCalledWith(USER_ID, 'hello', 'pong', []);
        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'pong', { format: 'markdown' });
    });

    it('runs the agent with user tools and system prompt', async () => {
        const user = makeUser({ timezone: 'Europe/Paris' });
        userRepository.findOneBy.mockImplementation(() => Promise.resolve(user));

        await harness.handleUserMessage(incoming());

        const ctx = toolRegistry.buildTools.mock.calls[0]?.[0];
        expect(ctx.user).toBe(user);
        expect(ctx.timezone).toBe('Europe/Paris');
        const [agentInput, agentTools] = langchainService.runAgent.mock.calls[0] ?? [];
        expect(agentInput.systemPrompt).toContain('(Europe/Paris)');
        expect(agentTools).toBe(tools);
    });

    it('saves reply and tool calls, then sends the reply', async () => {
        const digest: ToolCallDigest = { id: 'call_1', name: 'search', args: {}, digest: [1] };
        langchainService.runAgent.mockImplementation(() => Promise.resolve({ text: 'done', toolCalls: [digest] }));

        await harness.handleUserMessage(incoming());

        expect(messageService.saveMessages).toHaveBeenCalledWith(USER_ID, 'hello', 'done', [digest]);
        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'done', { format: 'markdown' });
    });

    it('maps stored tool calls into history turns', async () => {
        const toolCalls: ToolCallDigest[] = [{ id: 'call_1', name: 'search', args: { q: 'x' }, digest: [1] }];
        messageService.getMessages.mockImplementation(() =>
            Promise.resolve([makeMessage({ role: MessageRole.ASSISTANT, content: 'found it', toolCalls })])
        );

        await harness.handleUserMessage(incoming());

        const [agentInput] = langchainService.runAgent.mock.calls[0] ?? [];
        expect(agentInput.messages[0]).toEqual({ role: 'assistant', content: 'found it', toolCalls });
    });

    it('drops corrupt stored tool calls but keeps the text', async () => {
        const corrupt = [{ name: 's' }] as unknown as ToolCallDigest[];
        messageService.getMessages.mockImplementation(() =>
            Promise.resolve([
                makeMessage({ id: 'bad', role: MessageRole.ASSISTANT, content: 'text', toolCalls: corrupt }),
            ])
        );

        await harness.handleUserMessage(incoming());

        const [agentInput] = langchainService.runAgent.mock.calls[0] ?? [];
        expect(agentInput.messages[0]).toEqual({ role: 'assistant', content: 'text' });
        expect(agentInput.messages[0]).not.toHaveProperty('toolCalls');
    });

    it('routes a command and sends the returned text without calling the model', async () => {
        await harness.handleUserMessage(command('reset'));

        expect(commandRouter.handle).toHaveBeenCalledWith('reset', {
            user: expect.objectContaining({ id: USER_ID }),
            chatId: CHAT_ID,
            args: '',
        });
        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'command reply');
        expect(langchainService.runAgent).not.toHaveBeenCalled();
        expect(messageService.saveMessages).not.toHaveBeenCalled();
    });

    it('sends a formatted command reply with its format', async () => {
        commandRouter.handle.mockImplementation(() => Promise.resolve({ text: '<a href="u">x</a>', format: 'html' }));

        await harness.handleUserMessage(command('connect'));

        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, '<a href="u">x</a>', { format: 'html' });
    });

    it('passes command args to the router and keeps unknown commands out of history', async () => {
        await harness.handleUserMessage(command('foo', 'bar'));

        expect(commandRouter.handle).toHaveBeenCalledWith('foo', expect.objectContaining({ args: 'bar' }));
        expect(langchainService.runAgent).not.toHaveBeenCalled();
        expect(messageService.saveMessages).not.toHaveBeenCalled();
    });

    it('replies once to an unknown sender, then stays silent', async () => {
        userRepository.findOneBy.mockImplementation(() => Promise.resolve(null));

        await harness.handleUserMessage(incoming({ providerUserId: '999' }));
        await harness.handleUserMessage(incoming({ providerUserId: '999', text: 'again' }));

        expect(chatService.sendMessage).toHaveBeenCalledTimes(1);
        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, PRIVATE_REPLY);
        expect(messageService.saveMessages).not.toHaveBeenCalled();
        expect(langchainService.runAgent).not.toHaveBeenCalled();
    });

    it('replies once to a disallowed sender the same way', async () => {
        userRepository.findOneBy.mockImplementation(() => Promise.resolve(null));

        await harness.handleUserMessage(incoming());
        await harness.handleUserMessage(incoming({ text: 'again' }));

        expect(chatService.sendMessage).toHaveBeenCalledTimes(1);
        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, PRIVATE_REPLY);
        expect(messageService.saveMessages).not.toHaveBeenCalled();
        expect(commandRouter.handle).not.toHaveBeenCalled();
    });

    it('retries the private reply when sending it fails', async () => {
        userRepository.findOneBy.mockImplementation(() => Promise.resolve(null));
        chatService.sendMessage
            .mockImplementationOnce(() => Promise.reject(new Error('chat down')))
            .mockImplementation(() => Promise.resolve());

        await expect(harness.handleUserMessage(incoming({ providerUserId: '999' }))).rejects.toThrow('chat down');

        await harness.handleUserMessage(incoming({ providerUserId: '999', text: 'again' }));

        expect(chatService.sendMessage).toHaveBeenCalledTimes(2);
        expect(chatService.sendMessage).toHaveBeenNthCalledWith(1, CHAT_ID, PRIVATE_REPLY);
        expect(chatService.sendMessage).toHaveBeenNthCalledWith(2, CHAT_ID, PRIVATE_REPLY);
    });

    it('does not route a command from an unknown sender', async () => {
        userRepository.findOneBy.mockImplementation(() => Promise.resolve(null));

        await harness.handleUserMessage({ ...command('reset'), providerUserId: '999' });

        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, PRIVATE_REPLY);
        expect(commandRouter.handle).not.toHaveBeenCalled();
    });

    it('tells the user and saves nothing when langchain fails', async () => {
        langchainService.runAgent.mockImplementation(() => Promise.reject(new Error('openai down')));

        await expect(harness.handleUserMessage(incoming())).resolves.toBeUndefined();

        expect(messageService.saveMessages).not.toHaveBeenCalled();
        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, FAILED_REPLY);
    });

    it('tells the user and leaves the notebook unchanged when saving the exchange fails', async () => {
        messageService.saveMessages.mockImplementation(() => Promise.reject(new Error('db down')));

        await harness.handleUserMessage(incoming());

        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, FAILED_REPLY);
        expect(chatService.sendMessage).not.toHaveBeenCalledWith(CHAT_ID, 'pong', { format: 'markdown' });
    });

    it('tells the user when loading history fails', async () => {
        messageService.getMessages.mockImplementation(() => Promise.reject(new Error('db down')));

        await harness.handleUserMessage(incoming());

        expect(langchainService.runAgent).not.toHaveBeenCalled();
        expect(messageService.saveMessages).not.toHaveBeenCalled();
        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, FAILED_REPLY);
    });

    it('tells the user when a command handler throws', async () => {
        commandRouter.handle.mockImplementation(() => Promise.reject(new Error('db down')));

        await harness.handleUserMessage(command('connect'));

        expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, FAILED_REPLY);
    });

    it('tells the user when the reply cannot be delivered', async () => {
        chatService.sendMessage
            .mockImplementationOnce(() => Promise.reject(new Error('chat down')))
            .mockImplementationOnce(() => Promise.resolve());

        await harness.handleUserMessage(incoming());

        expect(messageService.saveMessages).toHaveBeenCalledWith(USER_ID, 'hello', 'pong', []);
        expect(chatService.sendMessage).toHaveBeenNthCalledWith(1, CHAT_ID, 'pong', { format: 'markdown' });
        expect(chatService.sendMessage).toHaveBeenNthCalledWith(2, CHAT_ID, FAILED_REPLY);
    });

    describe('outbox', () => {
        function pushToOutbox(...items: OutgoingMessage[]): void {
            toolRegistry.buildTools.mockImplementation((ctx: { outbox: OutgoingMessage[] }) => {
                ctx.outbox.push(...items);
                return tools;
            });
        }

        it('passes an empty outbox array in ToolContext', async () => {
            await harness.handleUserMessage(incoming());

            const ctx = toolRegistry.buildTools.mock.calls[0]?.[0];
            expect(ctx.outbox).toEqual([]);
        });

        it('sends outbox messages after the reply, in order, with format', async () => {
            pushToOutbox({ text: 'A', format: 'html' }, { text: 'B', format: 'plain' });

            await harness.handleUserMessage(incoming());

            expect(chatService.sendMessage).toHaveBeenCalledTimes(3);
            expect(chatService.sendMessage).toHaveBeenNthCalledWith(1, CHAT_ID, 'pong', { format: 'markdown' });
            expect(chatService.sendMessage).toHaveBeenNthCalledWith(2, CHAT_ID, 'A', { format: 'html' });
            expect(chatService.sendMessage).toHaveBeenNthCalledWith(3, CHAT_ID, 'B', { format: 'plain' });
        });

        it('calls onDelivered only after a successful send', async () => {
            const delivered = mock(() => Promise.resolve());
            const undelivered = mock(() => Promise.resolve());
            pushToOutbox(
                { text: 'A', format: 'html', onDelivered: delivered },
                { text: 'B', format: 'html', onDelivered: undelivered }
            );
            chatService.sendMessage
                .mockImplementationOnce(() => Promise.resolve())
                .mockImplementationOnce(() => Promise.resolve())
                .mockImplementationOnce(() => Promise.reject(new Error('chat down')));

            await harness.handleUserMessage(incoming());

            expect(delivered).toHaveBeenCalledTimes(1);
            expect(undelivered).not.toHaveBeenCalled();
        });

        it('continues after a failed outbox send', async () => {
            const logError = spyOn(
                (service as unknown as { logger: { error(...args: unknown[]): void } }).logger,
                'error'
            );
            pushToOutbox({ text: 'A', format: 'html' }, { text: 'B', format: 'plain' });
            chatService.sendMessage
                .mockImplementationOnce(() => Promise.resolve())
                .mockImplementationOnce(() => Promise.reject(new Error('chat down')))
                .mockImplementation(() => Promise.resolve());

            await harness.handleUserMessage(incoming());

            expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'B', { format: 'plain' });
            expect(chatService.sendMessage).not.toHaveBeenCalledWith(CHAT_ID, FAILED_REPLY);
            expect(logError).toHaveBeenCalledTimes(1);
        });

        it('discards the outbox when runAgent fails', async () => {
            pushToOutbox({ text: 'A', format: 'html' });
            langchainService.runAgent.mockImplementation(() => Promise.reject(new Error('openai down')));

            await harness.handleUserMessage(incoming());

            expect(chatService.sendMessage).toHaveBeenCalledTimes(1);
            expect(chatService.sendMessage).toHaveBeenCalledWith(CHAT_ID, FAILED_REPLY);
        });
    });
});
