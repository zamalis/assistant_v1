import type { StructuredToolInterface } from '@langchain/core/tools';
import type { User } from '../../../entities/user.entity';
import type { OutgoingMessage } from '../../chat-provider/chat-provider.schema';

export interface ToolContext {
    user: User;
    now: Date;
    timezone: string;
    outbox: OutgoingMessage[];
}

export interface ToolProvider {
    getTools(ctx: ToolContext): StructuredToolInterface[];
}
