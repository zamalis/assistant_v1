import { type MigrationInterface, type QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateChatTables1726444800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

        await queryRunner.createTable(
            new Table({
                name: 'users',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'created_at', type: 'timestamptz', default: 'now()' },
                    { name: 'updated_at', type: 'timestamptz', default: 'now()' },
                    { name: 'name', type: 'varchar', isUnique: true },
                    { name: 'telegram_id', type: 'varchar', isNullable: true, isUnique: true },
                    { name: 'is_allowed', type: 'boolean', default: true },
                ],
            })
        );

        await queryRunner.createTable(
            new Table({
                name: 'chat_messages',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'created_at', type: 'timestamptz', default: 'now()' },
                    { name: 'updated_at', type: 'timestamptz', default: 'now()' },
                    { name: 'user_id', type: 'uuid' },
                    { name: 'role', type: 'varchar' },
                    { name: 'content', type: 'text' },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'chat_messages',
            new TableForeignKey({
                columnNames: ['user_id'],
                referencedTableName: 'users',
                referencedColumnNames: ['id'],
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'chat_messages',
            new TableIndex({
                name: 'IDX_chat_messages_user_id_created_at',
                columnNames: ['user_id', 'created_at'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('chat_messages');
        await queryRunner.dropTable('users');
    }
}
