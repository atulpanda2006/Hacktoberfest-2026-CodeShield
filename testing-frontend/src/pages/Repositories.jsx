import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FolderGit2, Plus, RefreshCw, Search, Star } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, apiFieldErrors, repositoryApi } from '../services/api';
import Loading from '../components/Loading';
import { Alert, Card, EmptyState, Field, Spinner, StatusBadge } from '../components/ui';

const PAGE_SIZE = 10;

export default function Repositories() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [form, setForm] = useState({ reference: '', description: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // GET /repositories?page&limit&search (public)
      const response = await repositoryApi.list({ page, limit: PAGE_SIZE, search: query || undefined });
      setItems(response.data?.data ?? []);
      setPagination(response.data?.pagination ?? null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load repositories'));
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (location.state?.highlightId) {
      openDetail(location.state.highlightId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  async function openDetail(id) {
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    try {
      const response = await repositoryApi.get(id);
      setDetail(response.data?.data?.repository ?? null);
    } catch (err) {
      setDetailError(apiErrorMessage(err, 'Could not load repository details'));
    } finally {
      setDetailLoading(false);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function handleRegister(event) {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setNotice('');

    const reference = form.reference.trim();
    if (!reference) {
      setFieldErrors({ reference: 'Enter owner/repository or a GitHub URL' });
      return;
    }

    const payload = /^https?:\/\//i.test(reference)
      ? { repositoryUrl: reference }
      : { fullName: reference };
    if (form.description.trim()) payload.description = form.description.trim();

    setSubmitting(true);
    try {
      // POST /repositories — backend verifies the repo against GitHub
      const response = await repositoryApi.create(payload);
      const created = response.data?.data?.repository;
      setNotice(`Repository ${created?.fullName ?? reference} registered.`);
      setForm({ reference: '', description: '' });
      setShowForm(false);
      setPage(1);
      load();
      if (created?.id) openDetail(created.id);
    } catch (err) {
      setFieldErrors(apiFieldErrors(err));
      setFormError(apiErrorMessage(err, 'Could not register repository'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Repositories</h1>
          <p className="mt-1 text-xs text-slate-400">
            <code className="text-slate-300">GET /repositories</code> · registration verifies the
            repository against GitHub
          </p>
        </div>
        {isAuthenticated && (
          <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} /> Register repository
          </button>
        )}
      </div>

      {!isAuthenticated && (
        <Alert>
          Registration requires authentication.{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>{' '}
          to register a repository.
        </Alert>
      )}

      {notice && <Alert type="success">{notice}</Alert>}

      {showForm && isAuthenticated && (
        <form className="card space-y-4" onSubmit={handleRegister} noValidate>
          <h2 className="text-sm font-semibold text-slate-100">Register a GitHub repository</h2>
          {formError && <Alert>{formError}</Alert>}

          <Field
            label="Repository"
            error={fieldErrors.fullName || fieldErrors.repositoryUrl || fieldErrors.reference}
            hint="owner/repository, or https://github.com/owner/repository"
          >
            <input
              className="input"
              value={form.reference}
              onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
              placeholder="expressjs/express"
            />
          </Field>

          <Field label="Description (optional)" error={fieldErrors.description}>
            <input
              className="input"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Short description override"
            />
          </Field>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size={16} /> : <Plus size={16} />}
              {submitting ? 'Verifying with GitHub…' : 'Register'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            The backend requires a linked GitHub username, and the GitHub account must own or
            maintain the repository.
          </p>
        </form>
      )}

      <Card
        title="Registered repositories"
        actions={
          <form className="flex items-center gap-2" onSubmit={submitSearch}>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input w-48 pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
              />
            </div>
            <button type="submit" className="btn-secondary">
              <Search size={14} /> Search
            </button>
          </form>
        }
      >
        {loading ? (
          <Loading label="Loading repositories…" />
        ) : error ? (
          <div className="space-y-3">
            <Alert>{error}</Alert>
            <button type="button" className="btn-secondary" onClick={load}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No repositories registered"
            message="Register a repository to start tracking contributions."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="th">Repository</th>
                    <th className="th">Language</th>
                    <th className="th">Visibility</th>
                    <th className="th">Stars</th>
                    <th className="th">Members</th>
                    <th className="th">Contributions</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/70">
                  {items.map((repo) => (
                    <tr key={repo.id} className="hover:bg-navy-850/40">
                      <td className="td">
                        <p className="font-medium text-slate-100">{repo.fullName}</p>
                        <p className="text-[11px] text-slate-500">{repo.description || '—'}</p>
                      </td>
                      <td className="td">{repo.primaryLanguage || '—'}</td>
                      <td className="td">
                        <StatusBadge status={repo.visibility} />
                      </td>
                      <td className="td">
                        <span className="inline-flex items-center gap-1">
                          <Star size={13} className="text-slate-500" /> {repo.stars ?? 0}
                        </span>
                      </td>
                      <td className="td">{repo._count?.members ?? '—'}</td>
                      <td className="td">{repo._count?.contributions ?? '—'}</td>
                      <td className="td text-right">
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => openDetail(repo.id)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-2 py-1"
                    disabled={!pagination.hasPrevPage}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-2 py-1"
                    disabled={!pagination.hasNextPage}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {(detail || detailLoading || detailError) && (
        <Card
          title={detail ? `Repository · ${detail.fullName}` : 'Repository details'}
          actions={
            <button
              type="button"
              className="btn-secondary px-2 py-1 text-xs"
              onClick={() => {
                setDetail(null);
                setDetailError('');
              }}
            >
              Close
            </button>
          }
        >
          {detailLoading ? (
            <Loading label="Loading repository…" />
          ) : detailError ? (
            <Alert>{detailError}</Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Owner', detail.ownerGithubUsername],
                  ['Language', detail.primaryLanguage || '—'],
                  ['Stars / Forks', `${detail.stars} / ${detail.forks}`],
                  ['Registered', new Date(detail.createdAt).toLocaleDateString()],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-sm text-slate-200">{value}</p>
                  </div>
                ))}
              </div>

              {detail.repositoryUrl && (
                <a className="link text-xs" href={detail.repositoryUrl} target="_blank" rel="noreferrer">
                  Open on GitHub ↗
                </a>
              )}

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Members ({detail.members?.length ?? 0})
                </h3>
                {detail.members?.length ? (
                  <ul className="divide-y divide-navy-800 rounded-lg border border-navy-800">
                    {detail.members.map((member) => (
                      <li key={member.id} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-200">
                          {member.user?.username ?? member.userId}
                        </span>
                        <StatusBadge status={member.role} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">No members recorded.</p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      <p className="flex items-center gap-2 text-[11px] text-slate-600">
        <FolderGit2 size={13} /> Only repositories registered through the API are shown.
      </p>
    </div>
  );
}
