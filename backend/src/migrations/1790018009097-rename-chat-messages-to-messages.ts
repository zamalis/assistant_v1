import { type MigrationInterface, type QueryRunner } from 'typeorm';

const CHAT_MESSAGES_TABLE = 'chat_messages';
const MESSAGES_TABLE = 'messages';
const PREVIOUS_INDEX = 'IDX_chat_messages_user_id_created_at';
const NEXT_INDEX = 'IDX_messages_user_id_created_at';

export class RenameChatMessagesToMessages1790018009097 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.renameTable(CHAT_MESSAGES_TABLE, MESSAGES_TABLE);
        await queryRunner.query(`ALTER INDEX "${PREVIOUS_INDEX}" RENAME TO "${NEXT_INDEX}"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER INDEX "${NEXT_INDEX}" RENAME TO "${PREVIOUS_INDEX}"`);
        await queryRunner.renameTable(MESSAGES_TABLE, CHAT_MESSAGES_TABLE);
    }
}
