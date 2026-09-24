import { type AlbumStatisticsResponseDto } from '@immich/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { getAlbumStatisticsCounters, invalidateAlbumStatistics } from './album-statistics.service';

const DEFAULT_STATS: AlbumStatisticsResponseDto = { notShared: 4, owned: 6, shared: 2 };
const TTL_MS = 30_000;

describe('album-statistics.service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    sdkMock.getAlbumStatistics.mockResolvedValue(DEFAULT_STATS);
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateAlbumStatistics();
  });

  it('llama al SDK una sola vez cuando varios consumidores piden a la vez (coalescing)', async () => {
    const [a, b] = await Promise.all([getAlbumStatisticsCounters(), getAlbumStatisticsCounters()]);

    expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(1);
    expect(a).toEqual(DEFAULT_STATS);
    expect(b).toEqual(DEFAULT_STATS);
  });

  it('reutiliza el valor cacheado dentro de la ventana de TTL de 30 s', async () => {
    const first = await getAlbumStatisticsCounters();

    await vi.advanceTimersByTimeAsync(TTL_MS - 1);
    const second = await getAlbumStatisticsCounters();

    expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('dispara una nueva petición con force: true aunque haya caché válida', async () => {
    await getAlbumStatisticsCounters();

    await getAlbumStatisticsCounters({ force: true });

    expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(2);
  });

  it('expira la entrada y vuelve a llamar al SDK tras 30 s', async () => {
    await getAlbumStatisticsCounters();

    await vi.advanceTimersByTimeAsync(TTL_MS);
    await getAlbumStatisticsCounters();

    expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(2);
  });

  it('no cachea errores: propaga el rechazo y la siguiente llamada reintenta', async () => {
    sdkMock.getAlbumStatistics.mockRejectedValueOnce(new Error('boom'));

    await expect(getAlbumStatisticsCounters()).rejects.toThrow('boom');

    const retry = await getAlbumStatisticsCounters();
    expect(retry).toEqual(DEFAULT_STATS);
    expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(2);
  });
});