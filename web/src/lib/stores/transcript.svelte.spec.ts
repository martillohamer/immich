import { getAssetTranscript } from '@immich/sdk';
import type { TranscriptionResponseDto } from '@immich/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
import { transcriptManager } from '$lib/stores/transcript.svelte';
import type { SummaryData } from '$lib/types/transcript';

// Mock the SDK
vi.mock('@immich/sdk', () => ({
  getAssetInfo: vi.fn(),
  getAssetOcr: vi.fn(),
  getAssetTranscript: vi.fn(),
  getFaces: vi.fn(),
}));

const transcript: TranscriptionResponseDto = {
  text: 'Hola mundo',
  segments: [{ start: 0, end: 2.4, text: 'Hola' }],
  language: 'es',
  model: 'whisper',
  createdAt: new Date('2026-09-26T00:00:00Z'),
};

const notFoundError = Object.assign(new Error('Transcript not found'), { status: 404 });

describe('TranscriptManager', () => {
  beforeEach(() => {
    transcriptManager.clear();
    assetCacheManager.clearTranscriptCache();
    vi.clearAllMocks();
  });

  it('loads a transcript successfully', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.getAssetTranscript('asset-1');

    expect(getAssetTranscript).toHaveBeenCalledWith({ id: 'asset-1' });
    expect(transcriptManager.status).toBe('success');
    expect(transcriptManager.transcript).toEqual(transcript);
  });

  it('sets empty status when the transcript is a 404', async () => {
    vi.mocked(getAssetTranscript).mockRejectedValue(notFoundError);

    await transcriptManager.getAssetTranscript('asset-1');

    expect(transcriptManager.status).toBe('empty');
    expect(transcriptManager.transcript).toBeNull();
  });

  it('sets error status for other failures', async () => {
    vi.mocked(getAssetTranscript).mockRejectedValue(new Error('network down'));

    await transcriptManager.getAssetTranscript('asset-1');

    expect(transcriptManager.status).toBe('error');
    expect(transcriptManager.transcript).toBeNull();
  });

  it('resets to loading after clear and refetches', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.getAssetTranscript('asset-1');
    transcriptManager.clear();

    expect(transcriptManager.status).toBe('loading');
    expect(transcriptManager.transcript).toBeNull();

    await transcriptManager.getAssetTranscript('asset-1');
    expect(transcriptManager.status).toBe('success');
  });
});

describe('summary state', () => {
  beforeEach(() => {
    transcriptManager.clear();
    assetCacheManager.clearTranscriptCache();
    vi.clearAllMocks();
  });

  it('initializes with transcript tab, no summary, not generating', () => {
    expect(transcriptManager.activeTab).toBe('transcript');
    expect(transcriptManager.summaryData).toBeNull();
    expect(transcriptManager.isGeneratingSummary).toBe(false);
  });

  it('switches tabs with setActiveTab', () => {
    transcriptManager.setActiveTab('summary');
    expect(transcriptManager.activeTab).toBe('summary');

    transcriptManager.setActiveTab('transcript');
    expect(transcriptManager.activeTab).toBe('transcript');
  });

  it('switches to the chat tab', () => {
    transcriptManager.setActiveTab('chat');
    expect(transcriptManager.activeTab).toBe('chat');
  });

  it('marks generating during load and clears it on completion', async () => {
    const loading = transcriptManager.loadAssetSummary('asset-1');

    expect(transcriptManager.isGeneratingSummary).toBe(true);

    await loading;

    expect(transcriptManager.isGeneratingSummary).toBe(false);
    expect(transcriptManager.summaryData).not.toBeNull();
    expect(transcriptManager.summaryData?.executiveSummary).toContain('asset-1');
  });

  it('keeps summary state isolated from a later transcript fetch', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.loadAssetSummary('asset-1');
    await transcriptManager.getAssetTranscript('asset-1');

    expect(transcriptManager.summaryData).not.toBeNull();
    expect(transcriptManager.transcript).toEqual(transcript);
  });

  it('refetches a summary after clear (per-loader re-entry guard)', async () => {
    await transcriptManager.loadAssetSummary('asset-1');
    transcriptManager.clear();

    await transcriptManager.loadAssetSummary('asset-2');

    expect(transcriptManager.summaryData?.executiveSummary).toContain('asset-2');
  });

  it('transcript refetch still works after a summary load in the cleared window', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.getAssetTranscript('asset-1');
    transcriptManager.clear();
    // Invalida la caché del SDK para que el refetch vaya realmente a getAssetTranscript.
    assetCacheManager.clearTranscriptCache();

    // El resumen consume primero la ventana "cleared" con SU propio flag.
    await transcriptManager.loadAssetSummary('asset-2');

    // El loader de transcripción se resetea con SU propio flag y debe refetchear,
    // no corto-circuitar con el 'DONE' del loader ya ejecutado.
    await transcriptManager.getAssetTranscript('asset-1');

    expect(getAssetTranscript).toHaveBeenCalledTimes(2);
    expect(transcriptManager.transcript).toEqual(transcript);
  });

  it('clears summary state and resets to transcript tab', async () => {
    await transcriptManager.loadAssetSummary('asset-1');
    transcriptManager.setActiveTab('summary');

    transcriptManager.clear();

    expect(transcriptManager.activeTab).toBe('transcript');
    expect(transcriptManager.summaryData).toBeNull();
    expect(transcriptManager.isGeneratingSummary).toBe(false);
  });
});

describe('flashcard state', () => {
  const summary: SummaryData = {
    executiveSummary: 'E',
    keyConcepts: [{ term: 'T1', definition: 'D1' }],
    reviewQuestions: ['Q1'],
  };

  beforeEach(() => {
    transcriptManager.clear();
    assetCacheManager.clearTranscriptCache();
    vi.clearAllMocks();
  });

  it('initializes with no deck, index 0, empty grades and the transcript tab', () => {
    expect(transcriptManager.flashcardDeck).toBeNull();
    expect(transcriptManager.flashcardIndex).toBe(0);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.activeTab).toBe('transcript');
  });

  it('accepts flashcards as a tab', () => {
    transcriptManager.setActiveTab('flashcards');
    expect(transcriptManager.activeTab).toBe('flashcards');
  });

  it('builds the deck once and reuses it for the same summary reference', () => {
    const first = transcriptManager.ensureFlashcardsDeck(summary);
    const second = transcriptManager.ensureFlashcardsDeck(summary);
    expect(first).toBe(second);
    expect(second.cards.map((card) => card.id)).toEqual(['concept-0', 'question-0']);
  });

  it('rebuilds the deck and resets the session when the summary reference changes', () => {
    transcriptManager.ensureFlashcardsDeck(summary);
    transcriptManager.gradeFlashcard('concept-0', 'known');
    transcriptManager.setFlashcardIndex(1);

    const other: SummaryData = { executiveSummary: 'X', keyConcepts: [], reviewQuestions: [] };
    const rebuilt = transcriptManager.ensureFlashcardsDeck(other);

    expect(rebuilt.cards).toEqual([]);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.flashcardIndex).toBe(0);
  });

  it('accumulates grades immutably', () => {
    transcriptManager.ensureFlashcardsDeck(summary);
    const before = transcriptManager.flashcardGrades;
    transcriptManager.gradeFlashcard('concept-0', 'known');
    expect(transcriptManager.flashcardGrades).not.toBe(before);
    expect(transcriptManager.flashcardGrades).toEqual({ 'concept-0': 'known' });
  });

  it('updates the index with setFlashcardIndex', () => {
    transcriptManager.setFlashcardIndex(2);
    expect(transcriptManager.flashcardIndex).toBe(2);
  });

  it('resets index and grades without rebuilding the deck', () => {
    const deck = transcriptManager.ensureFlashcardsDeck(summary);
    transcriptManager.gradeFlashcard('concept-0', 'again');
    transcriptManager.setFlashcardIndex(1);

    transcriptManager.resetFlashcards();

    expect(transcriptManager.flashcardIndex).toBe(0);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.flashcardDeck).toBe(deck);
  });

  it('clears all flashcard state and restores the transcript tab', async () => {
    await transcriptManager.loadAssetSummary('asset-1');
    transcriptManager.ensureFlashcardsDeck(transcriptManager.summaryData!);
    transcriptManager.setActiveTab('flashcards');
    transcriptManager.gradeFlashcard('concept-0', 'known');

    transcriptManager.clear();

    expect(transcriptManager.flashcardDeck).toBeNull();
    expect(transcriptManager.flashcardIndex).toBe(0);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.activeTab).toBe('transcript');
  });
});
