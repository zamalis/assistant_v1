import type { ToolCallDigest } from '../../common/integrations/langchain/langchain.schema';

import { injectable } from 'tsyringe';

import { Message } from '../entities';
import { MessageRole } from '../enums';
import { MessageRepository } from '../repositories';

const MESSAGE_HISTORY_LIMIT = 40;

@injectable()
export class MessageService {
    constructor(private readonly messageRepository: MessageRepository) {}

    async getMessages(userId: string): Promise<Message[]> {
        const messages = await this.messageRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: MESSAGE_HISTORY_LIMIT,
        });

        return messages.reverse();
    }

    async saveMessages(
        userId: string,
        userContent: string,
        assistantContent: string,
        toolCalls: ToolCallDigest[] = []
    ): Promise<void> {
        const userCreatedAt = new Date();
        const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);

        await this.messageRepository.save([
            this.messageRepository.create({
                userId,
                role: MessageRole.USER,
                content: userContent,
                createdAt: userCreatedAt,
            }),
            this.messageRepository.create({
                userId,
                role: MessageRole.ASSISTANT,
                content: assistantContent,
                toolCalls: toolCalls.length ? toolCalls : null,
                createdAt: assistantCreatedAt,
            }),
        ]);
    }

    async reset(userId: string): Promise<void> {
        await this.messageRepository.delete({ userId });
    }
}
