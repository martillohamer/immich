import { AssetVisibility, type AssetStatsResponseDto } from '@immich/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { getTimelineStats, invalidateTimelineStats } from './asset-statistics.service';

const DEFAULT_STATS: AssetStatsResponseDto = { images: 5, videos: 3, total: 8 };
const TTL_MS = 30_000;

describe('asset-statistics.service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    sdkMock.getAssetStatistics.mockResolvedValue(DEFAULT_STATS);
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateTimelineStats();
  });

  it('llama al SDK una sola vez cuando varios consumidores piden a la vez (coalescing)', async () => {
    const [a, b] = await Promise.all([getTimelineStats(), getTimelineStats()]);

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(1);
    expect(sdkMock.getAssetStatistics).toHaveBeenCalledWith({ visibility: AssetVisibility.Timeline });
    expect(a).toEqual(DEFAULT_STATS);
    expect(b).toEqual(DEFAULT_STATS);
  });

  it('reutiliza el valor cacheado dentro de la ventana de TTL de 30 s', async () => {
    const first = await getTimelineStats();

    await vi.advanceTimersByTimeAsync(TTL_MS - 1);
    const second = await getTimelineStats();

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('dispara una nueva petición con force: true aunque haya caché válida', async () => {
    await getTimelineStats();

    await getTimelineStats({ force: true });

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(2);
  });

  it('expira la entrada y vuelve a llamar al SDK tras 30 s', async () => {
    await getTimelineStats();

    await vi.advanceTimersByTimeAsync(TTL_MS);
    await getTimelineStats();

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(2);
  });

  it('no cachea errores: propaga el rechazo y la siguiente llamada reintenta', async () => {
    sdkMock.getAssetStatistics.mockRejectedValueOnce(new Error('boom'));

    await expect(getTimelineStats()).rejects.toThrow('boom');

    const retry = await getTimelineStats();
    expect(retry).toEqual(DEFAULT_STATS);
    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(2);
  });
});