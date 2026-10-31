import env from '../../config/env.js';
import logger from '../../utils/logger.js';

/**
 * AI service client (Module 7).
 *
 * The model is owned and developed by the AI developer. This client only knows
 * the HTTP contract: POST {AI_SERVICE_URL}/analyze with a JSON payload, and a
 * JSON analysis response.
 *
 * Safety properties:
 *  - hard timeout per attempt (the backend never hangs on the AI service)
 *  - bounded retries with exponential backoff + jitter, only for failures that
 *    are safe to repeat (network errors, timeouts, 429, 5xx)
 *  - every failure is typed so callers can decide, and record, what happened
 *  - no fabricated results on failure
 */

export const AI_ERROR_CODES = {
  TIMEOUT: 'TIMEOUT',
  UNAVAILABLE: 'UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  REJECTED: 'REJECTED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
};

export class AIError extends Error {
  constructor(message, { code = AI_ERROR_CODES.UNAVAILABLE, status = null, attempts = 1 } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.status = status;
    this.attempts = attempts;
    this.isOperational = true;
  }
}

const RETRYABLE_CODES = new Set([
  AI_ERROR_CODES.TIMEOUT,
  AI_ERROR_CODES.UNAVAILABLE,
  AI_ERROR_CODES.RATE_LIMITED,
  AI_ERROR_CODES.SERVER_ERROR,
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attemptAnalyze(payload, { timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const url = `${env.ai.serviceUrl.replace(/\/$/, '')}/analyze`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AIError('AI service did not respond before the timeout', {
        code: AI_ERROR_CODES.TIMEOUT,
      });
    }
    throw new AIError('AI service is unreachable', { code: AI_ERROR_CODES.UNAVAILABLE });
  } finally {
    clearTimeout(timer);
  }

  const rawBody = await response.text();
  let parsed = null;

  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new AIError('AI service is rate limiting requests', {
        code: AI_ERROR_CODES.RATE_LIMITED,
        status: 429,
      });
    }

    if (response.status >= 500) {
      throw new AIError(`AI service error (HTTP ${response.status})`, {
        code: AI_ERROR_CODES.SERVER_ERROR,
        status: response.status,
      });
    }

    throw new AIError(
      parsed?.message ?? `AI service rejected the request (HTTP ${response.status})`,
      { code: AI_ERROR_CODES.REJECTED, status: response.status }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new AIError('AI service returned a response that is not valid JSON', {
      code: AI_ERROR_CODES.INVALID_RESPONSE,
      status: response.status,
    });
  }

  return parsed;
}

/**
 * Send one contribution to the AI service.
 *
 * @param {object} payload - contribution payload (see aiService.buildPayload)
 * @param {{ timeout?: number, maxRetries?: number, baseDelayMs?: number }} [options]
 * @returns {Promise<object>} the raw analysis object (validate before storing)
 */
export async function analyze(payload, options = {}) {
  if (!env.ai.serviceUrl) {
    throw new AIError('AI service URL is not configured', {
      code: AI_ERROR_CODES.NOT_CONFIGURED,
    });
  }

  const timeout = options.timeout ?? env.ai.timeout;
  const maxRetries = options.maxRetries ?? env.ai.maxRetries;
  const baseDelayMs = options.baseDelayMs ?? env.ai.retryBaseDelayMs;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await attemptAnalyze(payload, { timeout });
    } catch (error) {
      if (!(error instanceof AIError)) throw error;

      lastError = error;
      const retryable = RETRYABLE_CODES.has(error.code);

      if (!retryable || attempt === maxRetries) {
        error.attempts = attempt + 1;
        throw error;
      }

      const backoff = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
      logger.warn(
        `AI analysis attempt ${attempt + 1} failed (${error.code}); retrying in ${backoff}ms`
      );
      await sleep(backoff);
    }
  }

  throw lastError ?? new AIError('AI analysis failed');
}

export const AIClient = { analyze };

export default AIClient;
