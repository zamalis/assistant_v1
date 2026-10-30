import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateGmailPendingSends1793301138332 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "gmail_pending_sends" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "user_id" uuid NOT NULL,
                "draft_id" varchar NOT NULL,
                "recipients" text[] NOT NULL,
                "previewed_at" timestamptz NULL,
                "expires_at" timestamptz NOT NULL,
                CONSTRAINT "UQ_gmail_pending_sends_user_id" UNIQUE ("user_id"),
                CONSTRAINT "FK_gmail_pending_sends_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "gmail_pending_sends"`);
    }
}
