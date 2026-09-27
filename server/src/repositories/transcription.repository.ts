import { Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators.js';
import { DB } from 'src/schema/index.js';
import { type TranscriptionSegment, tokenizeForSearch } from 'src/utils/database.js';

type TranscriptUpsert = {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  model: string | null;
};

@Injectable()
export class TranscriptionRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [DummyValue.UUID] })
  getById(assetId: string) {
    return this.db
      .selectFrom('asset_transcript')
      .selectAll('asset_transcript')
      .where('asset_transcript.assetId', '=', assetId)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getByAssetId(assetId: string) {
    return this.db
      .selectFrom('asset_transcript')
      .selectAll('asset_transcript')
      .where('asset_transcript.assetId', '=', assetId)
      .execute();
  }

  @GenerateSql({
    params: [
      DummyValue.UUID,
      {
        text: DummyValue.STRING,
        segments: [{ start: DummyValue.NUMBER, end: DummyValue.NUMBER, text: DummyValue.STRING }],
        language: DummyValue.STRING,
        model: DummyValue.STRING,
      },
    ],
  })
  upsert(assetId: string, data: TranscriptUpsert) {
    const searchText = tokenizeForSearch(data.text).join(' ');

    return this.db
      .with('inserted_transcript', (db) =>
        db
          .insertInto('asset_transcript')
          .values({
            assetId,
            text: data.text,
            segments: data.segments,
            language: data.language,
            model: data.model,
          })
          .onConflict((oc) =>
            oc.column('assetId').doUpdateSet((eb) => ({
              text: eb.ref('excluded.text'),
              segments: eb.ref('excluded.segments'),
              language: eb.ref('excluded.language'),
              model: eb.ref('excluded.model'),
            })),
          ),
      )
      .with('inserted_search', (db) =>
        db
          .insertInto('transcript_search')
          .values({ assetId, assetTranscriptId: assetId, text: searchText })
          .onConflict((oc) => oc.column('assetId').doUpdateSet((eb) => ({ text: eb.ref('excluded.text') }))),
      )
      .selectNoFrom(sql`1`.as('dummy'))
      .execute();
  }

  deleteAll() {
    return this.db.transaction().execute(async (trx: Kysely<DB>) => {
      await sql`truncate ${sql.table('transcript_search')}, ${sql.table('asset_transcript')}`.execute(trx);
    });
  }

  async findMatchingSnippets(assetIds: string[], query: string): Promise<Map<string, string>> {
    const results = await this.db
      .selectFrom('transcript_search')
      .select(['assetId', 'text'])
      .where('assetId', 'in', assetIds)
      .where(() => sql`f_unaccent(text) %>> f_unaccent(${tokenizeForSearch(query).join(' ')})`)
      .execute();

    return new Map(results.map((r) => [r.assetId, r.text]));
  }
}
