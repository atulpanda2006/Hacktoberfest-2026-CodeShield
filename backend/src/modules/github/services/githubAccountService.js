import jwt from 'jsonwebtoken';

import { getPrismaClient } from '../../../config/database.js';
import env from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import { decryptToken, encryptToken, isCipherConfigured } from '../../../utils/tokenCipher.js';
import { GitHubClient, GITHUB_ERROR_CODES, GitHubError } from '../../../integrations/github/githubClient.js';

/**
 * GitHubAccountService — per-user GitHub credentials (Module 14).
 *
 * Every DTN user connects their OWN GitHub account. Tokens are encrypted with
 * AES-256-GCM before they touch PostgreSQL and are never returned by the API.
 * The platform-wide GITHUB_TOKEN, when present, is only used for anonymous
 * public reads — never for a user's privileged action.
 */

const SAFE_SELECT = {
  id: true,
  githubUserId: true,
  githubUsername: true,
  tokenType: true,
  scopes: true,
  connectedAt: true,
  updatedAt: true,
  expiresAt: true,
};

function parseScopes(scopes) {
  if (!scopes) return [];
  return scopes.split(',').map((scope) => scope.trim()).filter(Boolean);
}

function toSafeAccount(account) {
  if (!account) return null;

  return {
    id: account.id,
    githubUserId: account.githubUserId,
    githubUsername: account.githubUsername,
    tokenType: account.tokenType,
    scopes: parseScopes(account.scopes),
    connectedAt: account.connectedAt,
    updatedAt: account.updatedAt,
    expiresAt: account.expiresAt,
    isActive: !account.expiresAt || account.expiresAt > new Date(),
  };
}

/**
 * Translate a GitHub client failure raised while validating a user token into
 * an actionable API error.
 */
function toTokenValidationError(error) {
  if (!(error instanceof GitHubError)) return error;

  switch (error.code) {
    case GITHUB_ERROR_CODES.UNAUTHORIZED:
      return AppError.badRequest(
        'GitHub rejected this token. Make sure it is valid and has not expired or been revoked.'
      );
    case GITHUB_ERROR_CODES.RATE_LIMITED:
      return AppError.serviceUnavailable(
        'GitHub rate limit reached while validating the token. Please retry shortly.'
      );
    case GITHUB_ERROR_CODES.TIMEOUT:
    case GITHUB_ERROR_CODES.UNAVAILABLE:
      return AppError.serviceUnavailable(
        'Could not reach GitHub to validate this token. No changes were saved.'
      );
    default:
      return AppError.serviceUnavailable('GitHub could not validate this token');
  }
}

export class GitHubAccountService {
  /**
   * Current connection status for the authenticated user, plus a live token
   * check so the UI can prompt a reconnect for revoked/expired credentials.
   */
  static async getStatus(userId) {
    const prisma = getPrismaClient();

    const account = await prisma.gitHubAccount.findFirst({
      where: { userId },
      select: { ...SAFE_SELECT, encryptedAccessToken: true },
    });

    const base = {
      connected: Boolean(account),
      account: toSafeAccount(account),
      oauthConfigured: GitHubAccountService.isOAuthConfigured(),
      encryptionConfigured: isCipherConfigured(),
      tokenValid: null,
      rateLimit: null,
      checkedAt: new Date().toISOString(),
    };

    if (!account) return base;

    let token;
    try {
      token = decryptToken(account.encryptedAccessToken);
    } catch {
      return {
        ...base,
        tokenValid: false,
        error:
          'Stored GitHub token could not be decrypted (the encryption key may have changed). Reconnect your GitHub account.',
      };
    }

    try {
      const [user, rateLimit] = await Promise.all([
        GitHubClient.getAuthenticatedUser(token),
        GitHubClient.getRateLimit(token).catch(() => null),
      ]);

      return {
        ...base,
        tokenValid: true,
        rateLimit,
        account: { ...toSafeAccount(account), githubUsername: user.login },
      };
    } catch (error) {
      const invalid =
        error instanceof GitHubError && error.code === GITHUB_ERROR_CODES.UNAUTHORIZED;

      return {
        ...base,
        tokenValid: invalid ? false : null,
        error: invalid
          ? 'GitHub rejected the stored token. Reconnect your GitHub account.'
          : 'Could not verify the stored token with GitHub right now.',
      };
    }
  }

  /**
   * Validate a personal access token against GitHub, then store it encrypted.
   * Used for both first-time connection and token rotation.
   */
  static async connectWithToken(userId, rawToken, { tokenType = 'PAT' } = {}) {
    const prisma = getPrismaClient();

    if (!isCipherConfigured()) {
      throw AppError.serviceUnavailable(
        'GitHub token encryption is not configured on the server. Set GITHUB_TOKEN_ENCRYPTION_KEY and restart.'
      );
    }

    const token = rawToken?.trim();
    if (!token) {
      throw AppError.badRequest('A GitHub token is required');
    }

    let githubUser;
    try {
      githubUser = await GitHubClient.getAuthenticatedUser(token);
    } catch (error) {
      throw toTokenValidationError(error);
    }

    await GitHubAccountService.assertAccountAvailable(userId, githubUser);

    const encryptedAccessToken = encryptToken(token);

    const existing = await prisma.gitHubAccount.findFirst({ where: { userId } });

    const account = existing
      ? await prisma.gitHubAccount.update({
          where: { id: existing.id },
          data: {
            githubUserId: githubUser.githubUserId,
            githubUsername: githubUser.login,
            encryptedAccessToken,
            tokenType,
            scopes: githubUser.scopes.join(',') || null,
            expiresAt: null,
          },
          select: SAFE_SELECT,
        })
      : await prisma.gitHubAccount.create({
          data: {
            userId,
            githubUserId: githubUser.githubUserId,
            githubUsername: githubUser.login,
            encryptedAccessToken,
            tokenType,
            scopes: githubUser.scopes.join(',') || null,
          },
          select: SAFE_SELECT,
        });

    // Keep the public developer profile aligned with the connected account.
    // A username already claimed by another profile is left untouched instead
    // of failing the connection — the token itself is stored either way.
    try {
      const profile = await prisma.developerProfile.findUnique({
        where: { userId },
        select: { id: true, avatarUrl: true },
      });

      if (profile) {
        await prisma.developerProfile.update({
          where: { userId },
          data: {
            githubUsername: githubUser.login,
            githubProfileUrl: githubUser.profileUrl,
            avatarUrl: profile.avatarUrl ?? githubUser.avatarUrl,
          },
        });
      } else {
        await prisma.developerProfile.create({
          data: {
            userId,
            githubUsername: githubUser.login,
            githubProfileUrl: githubUser.profileUrl,
            avatarUrl: githubUser.avatarUrl,
          },
        });
      }
    } catch (error) {
      if (error.code !== 'P2002') throw error;
    }

    return {
      account: toSafeAccount(account),
      profile: {
        githubUsername: githubUser.login,
        avatarUrl: githubUser.avatarUrl,
        profileUrl: githubUser.profileUrl,
      },
    };
  }

  /**
   * One GitHub account can only belong to one DTN user.
   */
  static async assertAccountAvailable(userId, githubUser) {
    const prisma = getPrismaClient();

    const conflict = await prisma.gitHubAccount.findFirst({
      where: {
        githubUsername: githubUser.login,
        NOT: { userId },
      },
      select: { id: true },
    });

    if (conflict) {
      throw AppError.conflict(
        `GitHub account @${githubUser.login} is already connected to another account`
      );
    }
  }

  /**
   * Decrypted token for the authenticated user, or a clear 400 when they have
   * not connected GitHub yet. Never fall back to another user's credential.
   */
  static async requireUserToken(userId, { action = 'perform this action' } = {}) {
    const prisma = getPrismaClient();

    const account = await prisma.gitHubAccount.findFirst({
      where: { userId },
      select: { encryptedAccessToken: true, githubUsername: true, expiresAt: true },
    });

    if (!account) {
      throw AppError.badRequest(
        `Connect your GitHub account in Profile → GitHub connection before you ${action}.`
      );
    }

    if (account.expiresAt && account.expiresAt <= new Date()) {
      throw AppError.badRequest(
        'Your GitHub connection has expired. Reconnect your GitHub account in your profile.'
      );
    }

    let token;
    try {
      token = decryptToken(account.encryptedAccessToken);
    } catch {
      throw AppError.badRequest(
        'Your stored GitHub token could not be read. Reconnect your GitHub account in your profile.'
      );
    }

    return { token, githubUsername: account.githubUsername };
  }

  /**
   * Decrypted token, or null when the user has not connected GitHub.
   * Used where GitHub is optional (public data enrichment).
   */
  static async getOptionalUserToken(userId) {
    if (!userId) return null;

    try {
      const { token } = await GitHubAccountService.requireUserToken(userId);
      return token;
    } catch {
      return null;
    }
  }

  /**
   * Remove the stored credentials. Public trust data stays available.
   */
  static async disconnect(userId) {
    const prisma = getPrismaClient();

    const account = await prisma.gitHubAccount.findFirst({
      where: { userId },
      select: { id: true, githubUsername: true },
    });

    if (!account) {
      throw AppError.notFound('No GitHub account is connected');
    }

    await prisma.gitHubAccount.delete({ where: { id: account.id } });

    return { githubUsername: account.githubUsername };
  }

  // ------------------------------------------------------------
  // OAuth (optional; enabled when the client id/secret are configured)
  // ------------------------------------------------------------

  static isOAuthConfigured() {
    const { clientId, clientSecret } = env.github.oauth;
    return Boolean(
      clientId && clientSecret && !clientId.startsWith('your-') && !clientSecret.startsWith('your-')
    );
  }

  /**
   * Build the GitHub authorization URL with a short-lived, signed state token
   * bound to the requesting user (prevents CSRF and cross-user mixing).
   */
  static buildOAuthUrl(userId) {
    if (!GitHubAccountService.isOAuthConfigured()) {
      throw AppError.serviceUnavailable(
        'GitHub OAuth is not configured on the server. Use a personal access token instead.'
      );
    }

    const state = jwt.sign({ purpose: 'github-oauth', userId }, env.jwt.secret, {
      expiresIn: '10m',
    });

    const params = new URLSearchParams({
      client_id: env.github.oauth.clientId,
      redirect_uri: env.github.oauth.callbackUrl || '',
      scope: 'read:user public_repo',
      state,
      allow_signup: 'true',
    });

    return {
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      state,
    };
  }

  /**
   * Complete the OAuth exchange and store the resulting token.
   */
  static async handleOAuthCallback(code, state) {
    if (!code || !state) {
      throw AppError.badRequest('GitHub did not return an authorization code');
    }

    let decoded;
    try {
      decoded = jwt.verify(state, env.jwt.secret);
    } catch {
      throw AppError.badRequest('The GitHub authorization request expired. Please try again.');
    }

    if (decoded?.purpose !== 'github-oauth' || !decoded.userId) {
      throw AppError.badRequest('Invalid GitHub authorization state');
    }

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.github.oauth.clientId,
        client_secret: env.github.oauth.clientSecret,
        code,
        redirect_uri: env.github.oauth.callbackUrl || undefined,
      }),
    });

    const payload = await tokenResponse.json().catch(() => null);

    if (!tokenResponse.ok || !payload?.access_token) {
      throw AppError.badRequest(
        payload?.error_description || 'GitHub did not return an access token'
      );
    }

    return GitHubAccountService.connectWithToken(decoded.userId, payload.access_token, {
      tokenType: payload.token_type || 'bearer',
    });
  }
}

export default GitHubAccountService;
