import { Column, Entity, JoinColumn, OneToOne, type Relation } from 'typeorm';

import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity({ name: 'google_credentials' })
export class GoogleCredential extends BaseEntity {
    @Column({ type: 'uuid', unique: true })
    userId!: string;

    @OneToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User>;

    @Column({ type: 'text' })
    refreshToken!: string;

    @Column({ type: 'text', array: true })
    scopes!: string[];

    @Column({ type: 'varchar' })
    googleEmail!: string;
}
