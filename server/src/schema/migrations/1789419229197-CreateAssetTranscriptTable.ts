import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "asset_transcript" ("assetId" uuid NOT NULL, "text" text NOT NULL, "segments" jsonb NOT NULL, "language" character varying(2) NOT NULL DEFAULT 'es', "model" character varying(50), "createdAt" timestamp with time zone NOT NULL DEFAULT now(), "updatedAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp());`.execute(
    db,
  );
  await sql`ALTER TABLE "asset_transcript" ADD CONSTRAINT "asset_transcript_pkey" PRIMARY KEY ("assetId");`.execute(
    db,
  );
  await sql`ALTER TABLE "asset_transcript" ADD CONSTRAINT "asset_transcript_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE;`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "asset_transcript";`.execute(db);
}