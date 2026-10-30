import { createDataSource } from '../../database';
import { OAuthPendingConsent } from '../../entities/oauth-pending-consent.entity';
import { createTestEnv } from '../test-env';

import { describe, expect, it } from 'bun:test';

describe('oauth pending consent entity registration', () => {
    it('registers OAuthPendingConsent on the data source', () => {
        const dataSource = createDataSource(createTestEnv());
        const entities = dataSource.options.entities as unknown[];

        expect(entities).toContain(OAuthPendingConsent);
    });
});
