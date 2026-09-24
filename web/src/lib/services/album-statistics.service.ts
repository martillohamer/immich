import { getAlbumStatistics, type AlbumStatisticsResponseDto } from '@immich/sdk';

const TTL_MS = 30_000;

interface CacheEntry {
  promise: Promise<AlbumStatisticsResponseDto>;
  expiresAt: number;
}

let cache: CacheEntry | undefined;

const loadAlbumStatisticsCounters = (): Promise<AlbumStatisticsResponseDto> => {
  const promise = getAlbumStatistics();

  cache = {
    promise,
    expiresAt: Date.now() + TTL_MS,
  };

  // No cachear errores: si rechaza, se elimina la entrada por identidad para no
  // borrar una entrada más nueva creada entre tanto.
  void promise.catch(() => {
    if (cache?.promise === promise) {
      cache = undefined;
    }
  });

  return promise;
};

export const getAlbumStatisticsCounters = (options: { force?: boolean } = {}) => {
  if (!options.force && cache && cache.expiresAt > Date.now()) {
    return cache.promise;
  }

  return loadAlbumStatisticsCounters();
};

export const invalidateAlbumStatistics = () => {
  cache = undefined;
};