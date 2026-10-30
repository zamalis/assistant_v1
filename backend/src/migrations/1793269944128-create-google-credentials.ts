import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateGoogleCredentials1793269944128 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "google_credentials" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "user_id" uuid NOT NULL,
                "refresh_token" text NOT NULL,
                "scopes" text[] NOT NULL,
                "google_email" varchar NOT NULL,
                CONSTRAINT "UQ_google_credentials_user_id" UNIQUE ("user_id"),
                CONSTRAINT "FK_google_credentials_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "google_credentials"`);
    }
}
