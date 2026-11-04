import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import { DB } from 'src/schema/index.js';
import { searchAssetBuilder } from 'src/utils/database.js';

const db = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const scope = { userIds: [], lockedOwnerId: '' };

describe('searchAssetBuilder', () => {
  it('should add an EXISTS predicate on transcript_search when the transcript filter is set', () => {
    const query = searchAssetBuilder(db, { filter: { transcript: { matches: 'test' } } }, scope);
    const { sql } = query.compile();

    expect(sql).toContain('transcript_search');
    expect(sql).toContain('exists');
  });

  it('should not reference transcript_search when the transcript filter is absent', () => {
    const query = searchAssetBuilder(db, { filter: { city: { eq: 'Oslo' } } }, scope);
    const { sql } = query.compile();

    expect(sql).not.toContain('transcript_search');
  });
});
