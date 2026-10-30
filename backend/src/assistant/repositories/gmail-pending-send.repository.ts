import { injectable } from 'tsyringe';
import { DataSource } from 'typeorm';

import { BaseRepository } from '../../common/repositories';
import { GmailPendingSend } from '../entities';

export type SendableDraft = {
    draftId: string;
    recipients: string[];
};

type SendableDraftRow = {
    draft_id: string;
    recipients: string[];
};

@injectable()
export class GmailPendingSendRepository extends BaseRepository<GmailPendingSend> {
    constructor(dataSource: DataSource) {
        super(GmailPendingSend, dataSource);
    }

    /** Atomically deletes and returns the user's previewed, unexpired draft, so `/send` can only use it once. */
    public async consumeSendable(userId: string): Promise<SendableDraft | null> {
        const result = await this.createQueryBuilder()
            .delete()
            .from(GmailPendingSend)
            .where('"user_id" = :userId AND "previewed_at" IS NOT NULL AND "expires_at" > now()', { userId })
            .returning('"draft_id", "recipients"')
            .execute();

        const row = (result.raw as SendableDraftRow[])[0];
        if (!row) {
            return null;
        }

        return { draftId: row.draft_id, recipients: row.recipients };
    }
}
