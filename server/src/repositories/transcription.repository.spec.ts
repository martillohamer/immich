import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranscriptionRepository } from './transcription.repository.js';
import { Kysely, sql } from 'kysely';

// Mock the DB
vi.mock('@nestjs/kysely', () => ({
  InjectKysely: () => (target: unknown) => target,
  Kysely: class {},
}));

describe('TranscriptionRepository', () => {
  let mockDb: {
    selectFrom: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };

  let repo: TranscriptionRepository;

  beforeEach(() => {
    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    };

    // @ts-expect-error - mocking private db for testing
    repo = new TranscriptionRepository(mockDb as unknown as Kysely<unknown>);
  });

  it('findMatchingSnippets returns map of matching snippets', async () => {
    const mockResults = [
      { assetId: 'asset-1', text: 'hello world' },
      { assetId: 'asset-2', text: 'hello there' },
    ];

    mockDb.execute.mockResolvedValueOnce(mockResults);

    const snippets = await repo.findMatchingSnippets(['asset-1', 'asset-2'], 'hello world');

    expect(snippets instanceof Map).toBe(true);
    expect(snippets.size).toBe(2);
    expect(snippets.get('asset-1')).toBe('hello world');
    expect(snippets.get('asset-2')).toBe('hello there');
    expect(mockDb.selectFrom).toHaveBeenCalledWith('transcript_search');
    expect(mockDb.select).toHaveBeenCalledWith(['assetId', 'text']);
    expect(mockDb.where).toHaveBeenCalledWith('assetId', 'in', ['asset-1', 'asset-2']);
  });

  it('findMatchingSnippets returns empty map when no results', async () => {
    mockDb.execute.mockResolvedValueOnce([]);

    const snippets = await repo.findMatchingSnippets(['asset-1'], 'nonexistent');

    expect(snippets instanceof Map).toBe(true);
    expect(snippets.size).toBe(0);
  });
});