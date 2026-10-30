import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';

import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity({ name: 'oauth_pending_consents' })
export class OAuthPendingConsent extends BaseEntity {
    @Column({ type: 'varchar', unique: true })
    state!: string;

    @Column({ type: 'uuid' })
    userId!: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User>;

    @Column({ type: 'varchar' })
    codeVerifier!: string;

    @Column({ type: 'varchar' })
    chatId!: string;

    @Column({ type: 'timestamptz' })
    expiresAt!: Date;
}
