import { Column, Entity, OneToMany, type Relation } from 'typeorm';

import { Message } from '../../assistant/entities/message.entity.js';

import { BaseEntity } from './index.js';

@Entity({ name: 'users' })
export class User extends BaseEntity {
    @Column({ unique: true })
    name!: string;

    @Column({ type: 'varchar', nullable: true, unique: true })
    telegramId!: string | null;

    @Column({ default: true })
    isAllowed!: boolean;

    @Column({ type: 'varchar', default: 'UTC' })
    timezone!: string;

    @OneToMany(
        () => Message,
        (message) => message.user
    )
    messages!: Relation<Message>[];
}
