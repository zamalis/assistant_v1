import type { Env } from '../../schemas';
import type { IncomingMessageHandler, SendMessageOptions } from './chat-provider.schema';

import { FindOptionsWhere } from 'typeorm';

import { User } from '../../entities';

export abstract class ChatService<TClient = unknown> {
    protected readonly client: TClient;

    constructor(protected readonly env: Env) {
        this.client = this.createClient();
    }

    protected abstract createClient(): TClient;

    public abstract start(onMessage: IncomingMessageHandler): Promise<void>;

    public abstract stop(): Promise<void>;

    public abstract sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<void>;

    public getAllowedUserFilter(providerUserId: string): FindOptionsWhere<User> {
        return {
            isAllowed: true,
            [this.getProviderUserIdField()]: providerUserId,
        };
    }

    protected abstract getProviderUserIdField(): keyof User;
}
