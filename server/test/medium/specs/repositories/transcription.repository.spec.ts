import { Kysely } from 'kysely';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { TranscriptionRepository } from 'src/repositories/transcription.repository.js';
import { DB } from 'src/schema/index.js';
import { BaseService } from 'src/services/base.service.js';
import { type TranscriptionSegment, tokenizeForSearch } from 'src/utils/database.js';
import { newMediumService } from 'test/medium.factory.js';
import { getKyselyDB } from 'test/utils.js';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx } = newMediumService(BaseService, {
    database: db || defaultDatabase,
    real: [],
    mock: [LoggingRepository],
  });
  return { ctx, sut: new TranscriptionRepository(ctx.database) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(TranscriptionRepository.name, () => {
  afterEach(async () => {
    const { ctx } = setup();
    await ctx.database.deleteFrom('transcript_search').execute();
    await ctx.database.deleteFrom('asset_transcript').execute();
  });

  const segments: TranscriptionSegment[] = [
    { start: 0, end: 1.2, text: 'Hola' },
    { start: 1.2, end: 2.4, text: 'mundo' },
  ];

  describe('getById', () => {
    it('should return undefined for a non-existent transcript', async () => {
      const { sut } = setup();
      const result = await sut.getById('00000000-0000-4000-8000-000000000000');
      expect(result).toBeUndefined();
    });

    it('should return the transcript for an asset', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      await ctx.database
        .insertInto('asset_transcript')
        .values({ assetId: asset.id, text: 'Hola mundo', segments, language: 'es', model: 'small' })
        .execute();

      const result = await sut.getById(asset.id);

      expect(result).toEqual(
        expect.objectContaining({
          assetId: asset.id,
          text: 'Hola mundo',
          segments,
          language: 'es',
          model: 'small',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('getByAssetId', () => {
    it('should return an empty list when there is no transcript', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      const result = await sut.getByAssetId(asset.id);

      expect(result).toEqual([]);
    });

    it('should return the transcripts for an asset', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      await ctx.database
        .insertInto('asset_transcript')
        .values({ assetId: asset.id, text: 'Hola mundo', segments, language: 'es', model: 'small' })
        .execute();

      const result = await sut.getByAssetId(asset.id);

      expect(result).toEqual([
        expect.objectContaining({
          assetId: asset.id,
          text: 'Hola mundo',
          segments,
          language: 'es',
          model: 'small',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      ]);
    });
  });

  describe('upsert', () => {
    it('should insert a transcript and a transcript_search row with the tokenized text', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      await sut.upsert(asset.id, { text: 'Hola mundo', segments, language: 'es', model: 'small' });

      const transcript = await ctx.database
        .selectFrom('asset_transcript')
        .selectAll()
        .where('assetId', '=', asset.id)
        .executeTakeFirstOrThrow();

      expect(transcript).toEqual(
        expect.objectContaining({
          assetId: asset.id,
          text: 'Hola mundo',
          segments,
          language: 'es',
          model: 'small',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      const search = await ctx.database
        .selectFrom('transcript_search')
        .selectAll()
        .where('assetId', '=', asset.id)
        .executeTakeFirstOrThrow();

      expect(search).toEqual({
        assetId: asset.id,
        assetTranscriptId: asset.id,
        text: tokenizeForSearch('Hola mundo').join(' '),
      });
    });

    it('should update an existing transcript without duplicating search rows', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      await sut.upsert(asset.id, { text: 'Hola mundo', segments, language: 'es', model: 'small' });
      await sut.upsert(asset.id, {
        text: 'Segunda transcripción',
        segments: [{ start: 0, end: 1.5, text: 'Segunda' }],
        language: 'es',
        model: 'large',
      });

      const transcript = await ctx.database
        .selectFrom('asset_transcript')
        .selectAll()
        .where('assetId', '=', asset.id)
        .executeTakeFirstOrThrow();

      expect(transcript).toEqual(
        expect.objectContaining({
          assetId: asset.id,
          text: 'Segunda transcripción',
          segments: [{ start: 0, end: 1.5, text: 'Segunda' }],
          language: 'es',
          model: 'large',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      const searchRows = await ctx.database
        .selectFrom('transcript_search')
        .selectAll()
        .where('assetId', '=', asset.id)
        .execute();

      expect(searchRows).toEqual([
        {
          assetId: asset.id,
          assetTranscriptId: asset.id,
          text: tokenizeForSearch('Segunda transcripción').join(' '),
        },
      ]);
    });
  });

  describe('deleteAll', () => {
    it('should delete all transcripts and search rows', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      await sut.upsert(asset.id, { text: 'Hola mundo', segments, language: 'es', model: 'small' });

      await sut.deleteAll();

      const transcriptCount = await ctx.database
        .selectFrom('asset_transcript')
        .select(ctx.database.fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      const searchCount = await ctx.database
        .selectFrom('transcript_search')
        .select(ctx.database.fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      expect(transcriptCount.count).toBe(0);
      expect(searchCount.count).toBe(0);
    });
  });
});
