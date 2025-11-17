import { wrapAxiosError, ApiError } from "./axiosError";
import { logger, LogCategory } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableStatusCodes?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

function isRetryableError(
  error: ApiError,
  retryableStatusCodes: number[]
): boolean {
  if (
    error.statusCode === undefined ||
    error.statusCode === null ||
    error.statusCode === 0
  ) {
    return true;
  }

  const statusCode = error.statusCode;

  if (statusCode >= 400 && statusCode < 500) {
    return retryableStatusCodes.includes(statusCode);
  }

  if (statusCode >= 500) {
    return retryableStatusCodes.includes(statusCode);
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const wrappedError = wrapAxiosError(error);
      lastError = wrappedError;

      const shouldRetry =
        attempt < opts.maxRetries &&
        isRetryableError(wrappedError, opts.retryableStatusCodes);

      if (!shouldRetry) {
        logger.debug(LogCategory.RETRY, `Not retrying error`, {
          statusCode: wrappedError.statusCode,
          message: wrappedError.message,
          attempt: attempt + 1,
        });
        throw wrappedError;
      }

      if (attempt < opts.maxRetries) {
        logger.info(
          LogCategory.RETRY,
          `Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms`,
          {
            attempt: attempt + 1,
            maxRetries: opts.maxRetries,
            delay,
            statusCode: wrappedError.statusCode,
            message: wrappedError.message,
          }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  throw lastError || new Error("Retry failed");
}
