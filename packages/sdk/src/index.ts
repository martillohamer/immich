import { defaults } from './fetch-client.js';
import {
  MalformedResponseError,
  isTransientNetworkError,
  calculateDelay,
  sleep,
  type RetryOptions,
  defaultRetryOptions,
} from './fetch-errors.js';

export * from './fetch-client.js';
export * from './fetch-errors.js';

export interface InitOptions {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  retryOptions?: RetryOptions;
}

let retryOptions: RetryOptions = { ...defaultRetryOptions };

export const getRetryOptions = (): RetryOptions => retryOptions;

export const setRetryOptions = (options: RetryOptions): void => {
  retryOptions = options;
};

export const init = ({ baseUrl, apiKey, headers, retryOptions: customRetry }: InitOptions) => {
  setBaseUrl(baseUrl);
  setApiKey(apiKey);
  if (headers) {
    setHeaders(headers);
  }
  if (customRetry) {
    retryOptions = customRetry;
  }
};

export const getBaseUrl = () => defaults.baseUrl;

export const setBaseUrl = (baseUrl: string) => {
  defaults.baseUrl = baseUrl;
};

export const setApiKey = (apiKey: string) => {
  defaults.headers = defaults.headers || {};
  defaults.headers['x-api-key'] = apiKey;
};

export const setHeader = (key: string, value: string) => {
  assertNoApiKey(key);
  defaults.headers = defaults.headers || {};
  defaults.headers[key] = value;
};

export const setHeaders = (headers: Record<string, string>) => {
  defaults.headers = defaults.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    assertNoApiKey(key);
    defaults.headers[key] = value;
  }
};

const assertNoApiKey = (headerKey: string) => {
  if (headerKey.toLowerCase() === 'x-api-key') {
    throw new Error('The API key header can only be set using setApiKey().');
  }
};

export const jsonOnly =
  (impl?: typeof fetch): typeof fetch =>
  async (input, options) => {
    const response = await (impl ?? fetch)(input, options);

    const expectsJson = new Headers(options?.headers)
      .get('accept')
      ?.includes('json');
    if (!expectsJson || response.status === 204) {
      return response;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('json')) {
      throw new MalformedResponseError(
        'Expected a JSON response',
        response.url,
        response.status,
        contentType,
      );
    }

    return response;
  };

export const retryFetch =
  (impl?: typeof fetch): typeof fetch =>
  async (input, options, opts: RetryOptions = retryOptions) => {
    let lastError: unknown;
    let attempt = 0;

    while (attempt < opts.maxAttempts) {
      attempt++;
      try {
        const result = await (impl ?? fetch)(input, options);
        const expectsJson = new Headers(options?.headers)
          .get('accept')
          ?.includes('json');
        if (!expectsJson || result.status === 204) {
          return result;
        }
        const contentType = result.headers.get('content-type');
        if (!contentType?.includes('json')) {
          throw new MalformedResponseError(
            'Expected a JSON response',
            result.url,
            result.status,
            contentType,
          );
        }
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < opts.maxAttempts && isTransientNetworkError(error)) {
          const delay = calculateDelay(attempt, opts);
          await sleep(delay);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  };

export const setFetch = (impl: typeof fetch) => {
  defaults.fetch = jsonOnly(impl);
};

export const setRetryableFetch = (impl?: typeof fetch) => {
  defaults.fetch = retryFetch(impl);
};

defaults.fetch = jsonOnly();

export const getAssetOriginalPath = (id: string) => `/assets/${id}/original`;

export const getAssetThumbnailPath = (id: string) => `/assets/${id}/thumbnail`;

export const getAssetPlaybackPath = (id: string) =>
  `/assets/${id}/video/playback`;

export const getUserProfileImagePath = (userId: string) =>
  `/users/${userId}/profile-image`;

export const getPeopleThumbnailPath = (personId: string) =>
  `/people/${personId}/thumbnail`;
