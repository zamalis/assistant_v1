import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateOauthPendingConsents1793285354754 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "oauth_pending_consents" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "state" varchar NOT NULL,
                "user_id" uuid NOT NULL,
                "code_verifier" varchar NOT NULL,
                "chat_id" varchar NOT NULL,
                "expires_at" timestamptz NOT NULL,
                CONSTRAINT "UQ_oauth_pending_consents_state" UNIQUE ("state"),
                CONSTRAINT "FK_oauth_pending_consents_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "oauth_pending_consents"`);
    }
}
