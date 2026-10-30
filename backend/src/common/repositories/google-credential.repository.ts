import { injectable } from 'tsyringe';
import { DataSource } from 'typeorm';

import { GoogleCredential } from '../entities';

import { BaseRepository } from '.';

@injectable()
export class GoogleCredentialRepository extends BaseRepository<GoogleCredential> {
    constructor(dataSource: DataSource) {
        super(GoogleCredential, dataSource);
    }
}
