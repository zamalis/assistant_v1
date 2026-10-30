import { createDataSource } from '../../database';
import { GoogleCredential } from '../../entities/google-credential.entity';
import { createTestEnv } from '../test-env';

import { describe, expect, it } from 'bun:test';

describe('google credential entity registration', () => {
    it('registers GoogleCredential on the data source', () => {
        const dataSource = createDataSource(createTestEnv());
        const entities = dataSource.options.entities as unknown[];

        expect(entities).toContain(GoogleCredential);
    });
});
