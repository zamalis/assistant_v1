import { createDataSource } from '../../../common/database';
import { createTestEnv } from '../../../common/tests/test-env';
import { GmailPendingSend } from '../../entities';

import { describe, expect, it } from 'bun:test';

describe('gmail pending send entity registration', () => {
    it('registers GmailPendingSend on the data source', () => {
        const dataSource = createDataSource(createTestEnv());
        const entities = dataSource.options.entities as unknown[];

        expect(entities).toContain(GmailPendingSend);
    });
});
