import githubConfig from '../../config/github.js';

/**
 * GitHub REST API client (Module 4 / Module 6).
 *
 * Responsibilities:
 *  - a single place for HTTP concerns (auth headers, timeouts, error mapping)
 *  - normalize GitHub payloads into the shapes the backend stores
 *  - never invent data: every failure is surfaced as a typed GitHubError so
 *    callers can refuse to fabricate verification results.
 */

export const GITHUB_ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  UNAVAILABLE: 'UNAVAILABLE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  UNKNOWN: 'UNKNOWN',
};

export class GitHubError extends Error {
  constructor(message, { code = GITHUB_ERROR_CODES.UNKNOWN, status = null, resetAt = null } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status;
    this.resetAt = resetAt;
    this.isOperational = true;
  }
}

function secondsUntil(epochSeconds) {
  if (!epochSeconds) return null;
  const value = Number(epochSeconds);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, value - Math.floor(Date.now() / 1000));
}

/**
 * Build request headers.
 *
 * An explicit `token` (the caller's own GitHub credential) always wins. When it
 * is absent we fall back to the optional platform token, and finally to an
 * anonymous request (60 requests/hour) so public reads still work.
 */
function buildHeaders(token = null) {
  const headers = {
    ...githubConfig.getHeaders(),
  };

  const effectiveToken = token || githubConfig.token;

  if (effectiveToken && !effectiveToken.startsWith('your-')) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  } else {
    delete headers.Authorization;
  }

  return headers;
}

async function githubRequest(path, { token = null, method = 'GET', body = null } = {}) {
  const url = `${githubConfig.apiBaseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), githubConfig.timeout);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...buildHeaders(token),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new GitHubError('GitHub API request timed out', { code: GITHUB_ERROR_CODES.TIMEOUT });
    }
    throw new GitHubError('Unable to reach the GitHub API', {
      code: GITHUB_ERROR_CODES.UNAVAILABLE,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    throw new GitHubError('GitHub resource not found', {
      code: GITHUB_ERROR_CODES.NOT_FOUND,
      status: 404,
    });
  }

  if (response.status === 401) {
    throw new GitHubError('GitHub rejected the token used for this request', {
      code: GITHUB_ERROR_CODES.UNAUTHORIZED,
      status: 401,
    });
  }

  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAfter = secondsUntil(response.headers.get('x-ratelimit-reset'));
    const rateLimited = response.status === 429 || remaining === '0';

    throw new GitHubError(
      rateLimited ? 'GitHub API rate limit reached' : 'GitHub denied access to the resource',
      {
        code: rateLimited ? GITHUB_ERROR_CODES.RATE_LIMITED : GITHUB_ERROR_CODES.FORBIDDEN,
        status: response.status,
        resetAt: resetAfter,
      }
    );
  }

  if (!response.ok) {
    throw new GitHubError(`GitHub API error (HTTP ${response.status})`, {
      code: GITHUB_ERROR_CODES.UNKNOWN,
      status: response.status,
    });
  }

  try {
    return await response.json();
  } catch {
    throw new GitHubError('GitHub returned an unreadable response', {
      code: GITHUB_ERROR_CODES.INVALID_RESPONSE,
      status: response.status,
    });
  }
}

/**
 * Normalizers — keep only the fields the backend persists, so stored JSONB
 * evidence stays small and predictable.
 */
export function normalizeRepository(repo) {
  if (!repo || repo.id === undefined) return null;

  return {
    githubRepositoryId: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? null,
    repositoryUrl: repo.html_url,
    ownerGithubUsername: repo.owner?.login ?? repo.full_name?.split('/')[0] ?? null,
    primaryLanguage: repo.language ?? null,
    visibility: repo.private ? 'PRIVATE' : 'PUBLIC',
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    defaultBranch: repo.default_branch ?? null,
    isArchived: Boolean(repo.archived),
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    openIssues: repo.open_issues_count ?? 0,
  };
}

export function normalizePullRequest(pr) {
  if (!pr || pr.number === undefined) return null;

  return {
    githubPRId: String(pr.id),
    githubPRNumber: pr.number,
    githubPRUrl: pr.html_url,
    title: pr.title,
    body: pr.body ?? null,
    // GitHub reports merged PRs as state=closed + merged=true
    state: pr.merged ? 'MERGED' : pr.state,
    merged: Boolean(pr.merged),
    mergedAt: pr.merged_at ?? null,
    mergeCommitSha: pr.merge_commit_sha ?? null,
    closedAt: pr.closed_at ?? null,
    createdAt: pr.created_at ?? null,
    updatedAt: pr.updated_at ?? null,
    draft: Boolean(pr.draft),
    authorLogin: pr.user?.login ?? null,
    authorGithubId: pr.user?.id ? String(pr.user.id) : null,
    headRef: pr.head?.ref ?? null,
    headSha: pr.head?.sha ?? null,
    baseRef: pr.base?.ref ?? null,
    baseRepoFullName: pr.base?.repo?.full_name ?? null,
    baseRepoGithubId: pr.base?.repo?.id ? String(pr.base.repo.id) : null,
    commits: pr.commits ?? null,
    additions: pr.additions ?? null,
    deletions: pr.deletions ?? null,
    changedFiles: pr.changed_files ?? null,
  };
}

export function normalizeCommit(commit) {
  if (!commit) return null;

  return {
    sha: commit.sha,
    message: commit.commit?.message ?? null,
    authorLogin: commit.author?.login ?? commit.commit?.author?.name ?? null,
    authorGithubId: commit.author?.id ? String(commit.author.id) : null,
    authoredAt: commit.commit?.author?.date ?? null,
    additions: commit.stats?.additions ?? null,
    deletions: commit.stats?.deletions ?? null,
  };
}

export const GitHubClient = {
  /**
   * Validate a token and return the authenticated GitHub account.
   * Used when a user connects (or rotates) their personal token.
   * @param {string} token
   * @returns {Promise<{githubUserId: string, login: string, name: string|null,
   *   avatarUrl: string|null, profileUrl: string|null, scopes: string[]}>}
   */
  async getAuthenticatedUser(token) {
    const url = `${githubConfig.apiBaseUrl}/user`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), githubConfig.timeout);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(token),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new GitHubError('GitHub API request timed out', { code: GITHUB_ERROR_CODES.TIMEOUT });
      }
      throw new GitHubError('Unable to reach the GitHub API', {
        code: GITHUB_ERROR_CODES.UNAVAILABLE,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      throw new GitHubError('GitHub rejected this token', {
        code: GITHUB_ERROR_CODES.UNAUTHORIZED,
        status: 401,
      });
    }

    if (!response.ok) {
      throw new GitHubError(`GitHub API error (HTTP ${response.status})`, {
        code: response.status === 403 ? GITHUB_ERROR_CODES.FORBIDDEN : GITHUB_ERROR_CODES.UNKNOWN,
        status: response.status,
      });
    }

    const user = await response.json();

    // GitHub reports classic-token scopes in a response header. Fine-grained
    // tokens omit it, so we keep an empty list instead of inventing scopes.
    const scopeHeader = response.headers.get('x-oauth-scopes') || '';
    const scopes = scopeHeader
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);

    if (!user?.login) {
      throw new GitHubError('GitHub returned an unexpected user payload', {
        code: GITHUB_ERROR_CODES.INVALID_RESPONSE,
      });
    }

    return {
      githubUserId: String(user.id),
      login: user.login,
      name: user.name ?? null,
      avatarUrl: user.avatar_url ?? null,
      profileUrl: user.html_url ?? null,
      scopes,
    };
  },

  /**
   * Current rate limit for the given credential (or anonymous).
   */
  async getRateLimit(token = null) {
    const data = await githubRequest('/rate_limit', { token });
    const core = data?.resources?.core ?? data?.rate ?? null;

    if (!core) return null;

    return {
      limit: core.limit ?? null,
      remaining: core.remaining ?? null,
      resetAt: core.reset ? new Date(core.reset * 1000).toISOString() : null,
    };
  },

  /**
   * Fetch a repository by "owner/repo".
   * @returns {Promise<object>} normalized repository
   */
  async getRepository(fullName, token = null) {
    const repo = await githubRequest(`/repos/${fullName}`, { token });
    return normalizeRepository(repo);
  },

  /**
   * Fetch a pull request.
   * @returns {Promise<object>} normalized pull request
   */
  async getPullRequest(fullName, prNumber, token = null) {
    const pr = await githubRequest(`/repos/${fullName}/pulls/${prNumber}`, { token });
    return normalizePullRequest(pr);
  },

  /**
   * Fetch the commits of a pull request (GitHub paginates at 30 by default).
   * @param {string} fullName
   * @param {number} prNumber
   * @param {{ max?: number }} [options]
   * @returns {Promise<object[]>} normalized commits
   */
  async getPullRequestCommits(fullName, prNumber, { max = 100, token = null } = {}) {
    const perPage = Math.min(100, Math.max(1, max));
    const commits = await githubRequest(
      `/repos/${fullName}/pulls/${prNumber}/commits?per_page=${perPage}`,
      { token }
    );

    if (!Array.isArray(commits)) return [];
    return commits.map(normalizeCommit).filter(Boolean);
  },

  /**
   * Fetch a single commit (used to confirm commit metadata).
   */
  async getCommit(fullName, sha, token = null) {
    const commit = await githubRequest(`/repos/${fullName}/commits/${sha}`, { token });
    return normalizeCommit(commit);
  },

  /**
   * Fetch a GitHub user profile.
   */
  async getUser(username, token = null) {
    const user = await githubRequest(`/users/${encodeURIComponent(username)}`, { token });
    return {
      githubId: user?.id ? String(user.id) : null,
      login: user?.login ?? null,
      name: user?.name ?? null,
      avatarUrl: user?.avatar_url ?? null,
      profileUrl: user?.html_url ?? null,
      publicRepos: user?.public_repos ?? 0,
    };
  },

  /**
   * Check whether a user has collaborator access to a repository.
   * Returns { isCollaborator, permission } — permission is null when GitHub
   * does not disclose it (e.g. no token configured).
   */
  async getCollaboratorPermission(fullName, username, token = null) {
    try {
      const data = await githubRequest(
        `/repos/${fullName}/collaborators/${username}/permission`,
        { token }
      );
      return {
        isCollaborator: true,
        permission: data?.permission ?? null,
        roleName: data?.role_name ?? null,
      };
    } catch (error) {
      if (
        error instanceof GitHubError &&
        (error.code === GITHUB_ERROR_CODES.NOT_FOUND || error.code === GITHUB_ERROR_CODES.FORBIDDEN)
      ) {
        return { isCollaborator: false, permission: null, roleName: null };
      }
      throw error;
    }
  },
};

export default GitHubClient;
