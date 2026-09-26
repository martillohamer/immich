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
