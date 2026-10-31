import { AppError } from '../../utils/AppError.js';
import { GITHUB_ERROR_CODES, GitHubError } from './githubClient.js';

/**
 * Translate GitHub client failures into API errors.
 *
 * - GitHub is unreachable / rate limited -> 503 (the caller can retry later)
 * - GitHub says the resource does not exist -> 404
 * - our token is rejected -> 502 (configuration problem on our side)
 *
 * Nothing is fabricated: a failed lookup never produces "verified" data.
 */
export function toAppError(error, { notFoundMessage = 'GitHub resource not found' } = {}) {
  if (!(error instanceof GitHubError)) return error;

  switch (error.code) {
    case GITHUB_ERROR_CODES.NOT_FOUND:
      return AppError.notFound(notFoundMessage);

    case GITHUB_ERROR_CODES.RATE_LIMITED:
      return AppError.serviceUnavailable(
        error.resetAt
          ? `GitHub API rate limit reached. Try again in ${error.resetAt} seconds.`
          : 'GitHub API rate limit reached. Please try again later.'
      );

    case GITHUB_ERROR_CODES.TIMEOUT:
      return AppError.serviceUnavailable('GitHub did not respond in time. Please retry.');

    case GITHUB_ERROR_CODES.UNAVAILABLE:
      return AppError.serviceUnavailable('GitHub is currently unreachable. No data was stored.');

    case GITHUB_ERROR_CODES.UNAUTHORIZED:
      return AppError.serviceUnavailable(
        'GitHub integration is misconfigured (token rejected). Contact the platform administrator.'
      );

    case GITHUB_ERROR_CODES.FORBIDDEN:
      return AppError.forbidden('GitHub denied access to this resource');

    case GITHUB_ERROR_CODES.INVALID_RESPONSE:
      return AppError.serviceUnavailable('GitHub returned an unexpected response');

    default:
      return AppError.serviceUnavailable('GitHub request failed');
  }
}

export default { toAppError };
