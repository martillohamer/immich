import { HttpError } from '@oazapfts/runtime';

export interface ApiValidationError {
  code: string;
  path: (string | number)[];
  message: string;
}

export interface ApiExceptionResponse {
  message: string;
  error?: string;
  statusCode: number;
  errors?: ApiValidationError[];
}

export interface ApiHttpError extends HttpError {
  data: ApiExceptionResponse;
}

export function isHttpError(error: unknown): error is ApiHttpError {
  return error instanceof HttpError;
}

export class MalformedResponseError extends Error {
  override name = 'MalformedResponseError';

  constructor(
    reason: string,
    readonly url: string,
    readonly status: number,
    readonly contentType: string | null,
  ) {
    super(
      `${reason} (${url}, HTTP ${status}, content-type: ${contentType ?? 'none'})`,
    );
  }
}

export function isMalformedResponseError(
  error: unknown,
): error is MalformedResponseError {
  return error instanceof MalformedResponseError;
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof MalformedResponseError) {
    return error.status === 502 || error.status === 503 || error.status === 504;
  }
  if (error instanceof HttpError) {
    const status = (error as HttpError).status;
    return status === 502 || status === 503 || status === 504;
  }
  return true;
}

export function calculateDelay(attempt: number, options: RetryOptions): number {
  const delay = options.baseDelayMs * Math.pow(2, attempt - 1);
  return Math.min(delay, options.maxDelayMs);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
