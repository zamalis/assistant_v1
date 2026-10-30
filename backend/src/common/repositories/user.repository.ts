import { injectable } from 'tsyringe';
import { DataSource } from 'typeorm';

import { User } from '../../assistant/entities';

import { BaseRepository } from '.';

@injectable()
export class UserRepository extends BaseRepository<User> {
    constructor(dataSource: DataSource) {
        super(User, dataSource);
    }
}
