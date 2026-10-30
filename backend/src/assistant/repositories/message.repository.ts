import { injectable } from 'tsyringe';
import { DataSource } from 'typeorm';

import { BaseRepository } from '../../common/repositories';
import { Message } from '../entities';

@injectable()
export class MessageRepository extends BaseRepository<Message> {
    constructor(dataSource: DataSource) {
        super(Message, dataSource);
    }
}
