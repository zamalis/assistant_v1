import { createDataSource } from '../../../common/database';
import { User } from '../../../common/entities/user.entity';
import { createTestEnv } from '../../../common/tests/test-env';
import { Message } from '../../entities/message.entity';

import { describe, expect, it } from 'bun:test';

describe('chat entities registration', () => {
    it('registers User and Message on the data source', () => {
        const dataSource = createDataSource(createTestEnv());
        const entities = dataSource.options.entities as unknown[];

        expect(entities).toContain(User);
        expect(entities).toContain(Message);
    });
});
