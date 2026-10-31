import axios from 'axios';

/**
 * Single Axios instance for every API call.
 *
 * Backend contract (see backend docs/API.md):
 *  - base path: /api/v1
 *  - auth: `Authorization: Bearer <jwt>`
 *  - success: { success: true, message, data } (+ pagination for lists)
 *  - error:   { success: false, message, errors?: [{ field, message }] }
 */

export const TOKEN_KEY = 'ttn_access_token';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function isAuthPage() {
  const { pathname } = window.location;
  return pathname.startsWith('/login') || pathname.startsWith('/register');
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('ttn_user');
      if (!isAuthPage()) {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

/** Human-readable message from a backend error response. */
export function apiErrorMessage(error, fallback = 'Request failed') {
  const data = error?.response?.data;

  if (data?.errors?.length) {
    const details = data.errors
      .map((item) => (item.field ? `${item.field}: ${item.message}` : item.message))
      .join(' · ');
    return `${data.message || fallback} — ${details}`;
  }

  if (data?.message) return data.message;
  if (error?.code === 'ECONNABORTED') return 'Request timed out';
  if (!error?.response) {
    return `Cannot reach the API at ${baseURL}. Is the backend running?`;
  }
  return fallback;
}

/** Field-level errors, keyed by field name (for inline form messages). */
export function apiFieldErrors(error) {
  const errors = error?.response?.data?.errors;
  if (!Array.isArray(errors)) return {};
  return errors.reduce((acc, item) => {
    if (item.field) acc[item.field] = item.message;
    return acc;
  }, {});
}

export const healthApi = {
  check: () => api.get('/health'),
};

export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const profileApi = {
  mine: () => api.get('/profiles/me'),
  create: (payload) => api.post('/profiles', payload),
  updateMine: (payload) => api.put('/profiles/me', payload),
  byUser: (userId) => api.get(`/profiles/${userId}`),
};

export const githubApi = {
  // Per-user GitHub connection (token is never returned by the API)
  connection: () => api.get('/github/connection'),
  connect: (token) => api.post('/github/connection', { token }),
  disconnect: () => api.delete('/github/connection'),
  oauthStart: () => api.get('/github/oauth/start'),
};

export const repositoryApi = {
  list: (params) => api.get('/repositories', { params }),
  create: (payload) => api.post('/repositories', payload),
  get: (id) => api.get(`/repositories/${id}`),
  contributions: (id, params) => api.get(`/repositories/${id}/contributions`, { params }),
};

export const contributionApi = {
  list: (params) => api.get('/contributions', { params }),
  mine: (params) => api.get('/contributions/me', { params }),
  byUser: (userId, params) => api.get(`/contributions/user/${userId}`, { params }),
  create: (payload) => api.post('/contributions', payload),
  get: (id) => api.get(`/contributions/${id}`),
  updateStatus: (id, payload) => api.patch(`/contributions/${id}/status`, payload),
};

export const verificationApi = {
  verify: (contributionId) => api.post(`/verification/${contributionId}`),
  get: (contributionId) => api.get(`/verification/${contributionId}`),
  evidence: (contributionId) => api.get(`/verification/${contributionId}/evidence`),
};

export const aiApi = {
  analyze: (contributionId) => api.post(`/ai/analyze/${contributionId}`),
  results: (contributionId) => api.get(`/ai/results/${contributionId}`),
};

export const reputationApi = {
  mine: () => api.get('/reputation/me'),
  byUser: (userId) => api.get(`/reputation/${userId}`),
  breakdown: (userId) => api.get(`/reputation/${userId}/breakdown`),
  history: (userId, params) => api.get(`/reputation/${userId}/history`, { params }),
  recalculate: (userId, payload = {}) => api.post(`/reputation/recalculate/${userId}`, payload),
};

export const reviewApi = {
  create: (payload) => api.post('/reviews', payload),
  mine: (params) => api.get('/reviews/me', { params }),
  forContribution: (contributionId, params) =>
    api.get(`/reviews/contribution/${contributionId}`, { params }),
  update: (reviewId, payload) => api.patch(`/reviews/${reviewId}`, payload),
};

export const disputeApi = {
  create: (payload) => api.post('/disputes', payload),
  mine: (params) => api.get('/disputes/me', { params }),
  forContribution: (contributionId, params) =>
    api.get(`/disputes/contribution/${contributionId}`, { params }),
  get: (id) => api.get(`/disputes/${id}`),
  updateStatus: (id, payload) => api.patch(`/disputes/${id}/status`, payload),
};

export const dashboardApi = {
  developer: () => api.get('/dashboard/developer'),
  maintainer: () => api.get('/dashboard/maintainer'),
  admin: () => api.get('/dashboard/admin'),
  statistics: () => api.get('/dashboard/statistics'),
};

export default api;
