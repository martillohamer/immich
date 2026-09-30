import { getAssetTranscript } from '@immich/sdk';
import type { TranscriptionResponseDto } from '@immich/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
import { transcriptManager } from '$lib/stores/transcript.svelte';

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
