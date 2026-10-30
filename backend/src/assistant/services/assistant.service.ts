import type { User } from '../../common/entities';
import type { Message } from '../entities';

import { inject, injectable } from 'tsyringe';
import { z } from 'zod';

import {
    ChatService,
    type ChatTurn,
    LangchainService,
    type OutgoingMessage,
    type ProviderIncoming,
    ToolCallDigestSchema,
    ToolRegistry,
} from '../../common/integrations';
import { type AppLogger, getAppLogger } from '../../common/logger';
import { UserRepository } from '../../common/repositories';
import { CHAT_SERVICE } from '../../common/tokens';
import { CommandRouter } from '../commands';
import { MessageRole } from '../enums';
import { buildSystemPrompt, resolveTimezone } from '../prompts';

import { MessageService } from './message.service';

const PRIVATE_REPLY = 'This bot is private.';
const FAILED_REPLY = 'I could not answer that. Please try again.';

@injectable()
export class AssistantService {
    private readonly logger: AppLogger = getAppLogger(AssistantService.name);
    private readonly refusedProviderUserIds = new Set<string>();

    constructor(
        @inject(CHAT_SERVICE) private readonly chatService: ChatService,
        private readonly messageService: MessageService,
        private readonly llmService: LangchainService,
        private readonly userRepository: UserRepository,
        private readonly toolRegistry: ToolRegistry,
        private readonly commandRouter: CommandRouter
    ) {}

    public start(): Promise<void> {
        return this.chatService.start((incoming) => this.handleUserMessage(incoming));
    }

    public stop(): Promise<void> {
        return this.chatService.stop();
    }

    private async handleUserMessage(incoming: ProviderIncoming): Promise<void> {
        const user = await this.findAllowedUser(incoming.providerUserId);
        if (!user) {
            await this.replyPrivateOnce(incoming);
            return;
        }

        try {
            if (incoming.kind === 'command') {
                const reply = await this.commandRouter.handle(incoming.command, {
                    user,
                    chatId: incoming.chatId,
                    args: incoming.args,
                });
                if (typeof reply === 'string') {
                    await this.chatService.sendMessage(incoming.chatId, reply);
                } else {
                    await this.chatService.sendMessage(incoming.chatId, reply.text, { format: reply.format });
                }
                return;
            }

            const now = new Date();
            const timezone = resolveTimezone(user.timezone, user.id);
            const outbox: OutgoingMessage[] = [];
            const tools = this.toolRegistry.buildTools({ user, now, timezone, outbox });

            const history = await this.messageService.getMessages(user.id);
            const turns: ChatTurn[] = [
                ...history.map((message) => this.toChatTurn(message)),
                { role: MessageRole.USER, content: incoming.text },
            ];

            const { text, toolCalls } = await this.llmService.runAgent(
                { systemPrompt: buildSystemPrompt({ now, timezone }), messages: turns },
                tools
            );
            await this.messageService.saveMessages(user.id, incoming.text, text, toolCalls);
            await this.chatService.sendMessage(incoming.chatId, text, { format: 'markdown' });
            await this.deliverOutbox(incoming.chatId, outbox, user.id);
        } catch (error) {
            this.logger.error(error, `Failed to complete chat for user ${user.id}`);
            await this.chatService.sendMessage(incoming.chatId, FAILED_REPLY);
        }
    }

    private async deliverOutbox(chatId: string, outbox: OutgoingMessage[], userId: string): Promise<void> {
        for (const item of outbox) {
            try {
                await this.chatService.sendMessage(chatId, item.text, { format: item.format });
                await item.onDelivered?.();
            } catch (error) {
                this.logger.error({ err: error, userId }, 'Failed to deliver outbox message');
            }
        }
    }

    private toChatTurn(message: Message): ChatTurn {
        const turn: ChatTurn = { role: message.role, content: message.content };
        if (!message.toolCalls) {
            return turn;
        }

        const parsed = z.array(ToolCallDigestSchema).safeParse(message.toolCalls);
        if (!parsed.success) {
            this.logger.warn(
                { messageId: message.id, issues: parsed.error.issues },
                'Dropping corrupt stored tool calls'
            );
            return turn;
        }

        return { ...turn, toolCalls: parsed.data };
    }

    private findAllowedUser(providerUserId: string): Promise<User | null> {
        const filter = this.chatService.getAllowedUserFilter(providerUserId);
        return this.userRepository.findOneBy(filter);
    }

    private async replyPrivateOnce({ providerUserId, chatId }: ProviderIncoming): Promise<void> {
        if (this.refusedProviderUserIds.has(providerUserId)) {
            return;
        }

        this.logger.warn(`Provider user ${providerUserId} is not allowed`);
        await this.chatService.sendMessage(chatId, PRIVATE_REPLY);
        this.refusedProviderUserIds.add(providerUserId);
    }
}
