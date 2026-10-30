import type { BaseEntity } from '../entities';

import { type DataSource, type EntityTarget, Repository } from 'typeorm';

export abstract class BaseRepository<T extends BaseEntity> extends Repository<T> {
    constructor(target: EntityTarget<T>, dataSource: DataSource) {
        super(target, dataSource.manager, dataSource.manager.queryRunner);
    }
}
