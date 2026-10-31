import env from './env.js';

/**
 * GitHub REST API configuration.
 *
 * GITHUB_TOKEN is optional for public data, but GitHub applies a much lower
 * unauthenticated rate limit (60 requests/hour). Use a fine-grained token with
 * read-only access to public repositories / metadata.
 */
const githubConfig = {
  apiBaseUrl: env.github.apiBaseUrl.replace(/\/$/, ''),
  token: env.github.token,
  timeout: env.github.timeout,

  getHeaders() {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'TrustNetwork-Backend',
    };

    if (this.token && !this.token.startsWith('your-')) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  },

  isAuthenticated() {
    return Boolean(this.token && !this.token.startsWith('your-'));
  },
};

export default githubConfig;
