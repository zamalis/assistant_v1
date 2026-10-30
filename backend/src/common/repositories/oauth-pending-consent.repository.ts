import { injectable } from 'tsyringe';
import { DataSource } from 'typeorm';

import { OAuthPendingConsent } from '../entities';

import { BaseRepository } from '.';

export type ConsumedConsent = {
    id: string;
    userId: string;
    codeVerifier: string;
    chatId: string;
};

type ConsumedConsentRow = {
    id: string;
    user_id: string;
    code_verifier: string;
    chat_id: string;
};

@injectable()
export class OAuthPendingConsentRepository extends BaseRepository<OAuthPendingConsent> {
    constructor(dataSource: DataSource) {
        super(OAuthPendingConsent, dataSource);
    }

    /** Atomically deletes and returns the unexpired row for `state`, so a callback can only be used once. */
    public async consumeValid(state: string): Promise<ConsumedConsent | null> {
        const result = await this.createQueryBuilder()
            .delete()
            .from(OAuthPendingConsent)
            .where('"state" = :state AND "expires_at" > now()', { state })
            .returning('"id", "user_id", "code_verifier", "chat_id"')
            .execute();

        const row = (result.raw as ConsumedConsentRow[])[0];
        if (!row) {
            return null;
        }

        return { id: row.id, userId: row.user_id, codeVerifier: row.code_verifier, chatId: row.chat_id };
    }
}
