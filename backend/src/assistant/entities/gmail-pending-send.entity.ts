import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';

import { BaseEntity } from '../../common/entities';
import { User } from '../../common/entities/user.entity';

@Entity({ name: 'gmail_pending_sends' })
export class GmailPendingSend extends BaseEntity {
    @Column({ type: 'uuid', unique: true })
    userId!: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User>;

    @Column({ type: 'varchar' })
    draftId!: string;

    @Column({ type: 'text', array: true })
    recipients!: string[];

    @Column({ type: 'timestamptz', nullable: true })
    previewedAt!: Date | null;

    @Column({ type: 'timestamptz' })
    expiresAt!: Date;
}
