import { AssetVisibility, getAssetStatistics, type AssetStatsResponseDto } from '@immich/sdk';

const TTL_MS = 30_000;

interface CacheEntry {
  promise: Promise<AssetStatsResponseDto>;
  expiresAt: number;
}

const cache = new Map<AssetVisibility, CacheEntry>();

const loadTimelineStats = (): Promise<AssetStatsResponseDto> => {
  const promise = getAssetStatistics({ visibility: AssetVisibility.Timeline });

  cache.set(AssetVisibility.Timeline, {
    promise,
    expiresAt: Date.now() + TTL_MS,
  });

  // No cachear errores: si rechaza, se elimina la entrada por identidad para no
  // borrar una entrada más nueva creada entre tanto.
  void promise.catch(() => {
    const current = cache.get(AssetVisibility.Timeline);
    if (current?.promise === promise) {
      cache.delete(AssetVisibility.Timeline);
    }
  });

  return promise;
};

export const getTimelineStats = (options: { force?: boolean } = {}) => {
  const entry = cache.get(AssetVisibility.Timeline);

  if (!options.force && entry && entry.expiresAt > Date.now()) {
    return entry.promise;
  }

  return loadTimelineStats();
};

export const invalidateTimelineStats = () => {
  cache.delete(AssetVisibility.Timeline);
};