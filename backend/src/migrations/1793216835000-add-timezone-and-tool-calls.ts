import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddTimezoneAndToolCalls1793216835000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "timezone" varchar NOT NULL DEFAULT 'UTC'`);
        await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN "tool_calls" jsonb NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "tool_calls"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "timezone"`);
    }
}
