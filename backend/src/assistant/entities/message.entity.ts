import type { ToolCallDigest } from '../../common/integrations/langchain/langchain.schema';

import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';

import { BaseEntity } from '../../common/entities';
import { User } from '../../common/entities/user.entity';
import { MessageRole } from '../enums';

@Entity({ name: 'messages' })
@Index('IDX_messages_user_id_created_at', ['userId', 'createdAt'])
export class Message extends BaseEntity {
    @Column()
    userId!: string;

    @Column({ type: 'varchar' })
    role!: MessageRole;

    @Column({ type: 'text' })
    content!: string;

    @Column({ type: 'jsonb', nullable: true })
    toolCalls!: ToolCallDigest[] | null;

    @ManyToOne(
        () => User,
        (user) => user.messages,
        { onDelete: 'CASCADE' }
    )

    @JoinColumn({ name: 'user_id' })
    user!: Relation<User>;
}
