import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Plus, RefreshCw, Search } from 'lucide-react';

import { apiErrorMessage, apiFieldErrors, reviewApi } from '../services/api';
import Loading from '../components/Loading';
import { Alert, Card, EmptyState, Field, Spinner, StatusBadge } from '../components/ui';

const DECISIONS = ['APPROVE', 'REQUEST_CHANGES', 'REJECT'];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function Reviews() {
  const [mine, setMine] = useState([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineError, setMineError] = useState('');

  const [lookupId, setLookupId] = useState('');
  const [lookup, setLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    contributionId: '',
    decision: 'APPROVE',
    rating: '5',
    comments: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadMine = useCallback(async () => {
    setMineLoading(true);
    setMineError('');
    try {
      // GET /reviews/me
      const response = await reviewApi.mine({ limit: 25 });
      setMine(response.data?.data ?? []);
    } catch (err) {
      setMineError(apiErrorMessage(err, 'Could not load your reviews'));
    } finally {
      setMineLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  async function lookupReviews(event) {
    event?.preventDefault();
    const id = lookupId.trim();
    if (!id) {
      setLookupError('Enter a contribution id');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    setLookup(null);
    try {
      // GET /reviews/contribution/:contributionId (public)
      const response = await reviewApi.forContribution(id, { limit: 25 });
      setLookup(response.data ?? null);
    } catch (err) {
      setLookupError(apiErrorMessage(err, 'Could not load reviews'));
    } finally {
      setLookupLoading(false);
    }
  }

  function validate() {
    const next = {};
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!form.contributionId.trim()) next.contributionId = 'Contribution id is required';
    else if (!uuid.test(form.contributionId.trim())) next.contributionId = 'Must be a valid UUID';
    if (form.rating && (Number(form.rating) < 1 || Number(form.rating) > 5)) {
      next.rating = 'Rating must be between 1 and 5';
    }
    if (form.comments.length > 2000) next.comments = 'Max 2000 characters';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setFormError('');
    setNotice('');
    try {
      // POST /reviews
      const payload = {
        contributionId: form.contributionId.trim(),
        decision: form.decision,
        ...(form.comments.trim() ? { comments: form.comments.trim() } : {}),
        ...(form.rating ? { rating: Number(form.rating) } : {}),
      };
      await reviewApi.create(payload);
      setNotice('Review submitted.');
      setForm({ contributionId: '', decision: 'APPROVE', rating: '5', comments: '' });
      setShowForm(false);
      loadMine();
      if (lookupId.trim() === payload.contributionId) lookupReviews();
    } catch (err) {
      setFieldErrors(apiFieldErrors(err));
      setFormError(apiErrorMessage(err, 'Could not submit review'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Reviews</h1>
          <p className="mt-1 text-xs text-slate-400">
            Reviewer-only endpoint: your account needs REVIEWER, MAINTAINER, ADMIN, or repository
            maintainer access.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={15} /> Submit review
        </button>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}

      {showForm && (
        <form className="card space-y-4" onSubmit={handleSubmit} noValidate>
          <h2 className="text-sm font-semibold text-slate-100">Review a contribution</h2>
          {formError && <Alert>{formError}</Alert>}

          <Field
            label="Contribution id"
            error={fieldErrors.contributionId}
            hint="Copy the id from the Contributions detail panel"
          >
            <input
              className="input"
              value={form.contributionId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contributionId: event.target.value }))
              }
              placeholder="c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Decision" error={fieldErrors.decision}>
              <select
                className="input"
                value={form.decision}
                onChange={(event) => setForm((prev) => ({ ...prev, decision: event.target.value }))}
              >
                {DECISIONS.map((decision) => (
                  <option key={decision} value={decision}>
                    {decision}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Rating (1–5)" error={fieldErrors.rating}>
              <select
                className="input"
                value={form.rating}
                onChange={(event) => setForm((prev) => ({ ...prev, rating: event.target.value }))}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Comments (optional)" error={fieldErrors.comments}>
            <textarea
              className="input min-h-[80px]"
              value={form.comments}
              onChange={(event) => setForm((prev) => ({ ...prev, comments: event.target.value }))}
              placeholder="What did you verify?"
            />
          </Field>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size={16} /> : <MessageSquare size={16} />}
              {submitting ? 'Submitting…' : 'Submit review'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            The contribution must be verified first, and you cannot review your own work.
          </p>
        </form>
      )}

      <Card
        title="Your reviews"
        actions={
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={loadMine}>
            <RefreshCw size={13} /> Refresh
          </button>
        }
      >
        {mineLoading ? (
          <Loading label="Loading your reviews…" />
        ) : mineError ? (
          <Alert>{mineError}</Alert>
        ) : mine.length === 0 ? (
          <EmptyState title="You have not written any reviews" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-navy-800">
                  <th className="th">Contribution</th>
                  <th className="th">Contributor</th>
                  <th className="th">Decision</th>
                  <th className="th">Rating</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/70">
                {mine.map((review) => (
                  <tr key={review.id}>
                    <td className="td">
                      <p className="text-slate-200">{review.contribution?.title ?? review.contributionId}</p>
                      <p className="text-[11px] text-slate-500">{review.contribution?.status}</p>
                    </td>
                    <td className="td">{review.contribution?.contributor?.username ?? '—'}</td>
                    <td className="td">
                      <StatusBadge status={review.decision} />
                    </td>
                    <td className="td">{review.rating ?? '—'}</td>
                    <td className="td text-xs">{formatDate(review.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Browse reviews for a contribution">
        <form className="flex flex-wrap items-center gap-2" onSubmit={lookupReviews}>
          <input
            className="input max-w-md"
            value={lookupId}
            onChange={(event) => setLookupId(event.target.value)}
            placeholder="Contribution UUID"
          />
          <button type="submit" className="btn-secondary" disabled={lookupLoading}>
            {lookupLoading ? <Spinner size={14} /> : <Search size={14} />} Look up
          </button>
        </form>

        <div className="mt-4">
          {lookupError && <Alert>{lookupError}</Alert>}

          {lookup && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                <span>Status: {lookup.data?.[0]?.contribution?.status ?? '—'}</span>
                {lookup.summary && (
                  <>
                    <span>Approvals: {lookup.summary.APPROVE}</span>
                    <span>Changes requested: {lookup.summary.REQUEST_CHANGES}</span>
                    <span>Rejections: {lookup.summary.REJECT}</span>
                    <span>Average rating: {lookup.summary.averageRating ?? '—'}</span>
                  </>
                )}
              </div>

              {lookup.data?.length ? (
                <ul className="divide-y divide-navy-800 rounded-lg border border-navy-800">
                  {lookup.data.map((review) => (
                    <li key={review.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-300">
                          {review.reviewer?.username ?? 'reviewer'} · rating {review.rating ?? '—'}
                        </span>
                        <StatusBadge status={review.decision} />
                      </div>
                      {review.comments && (
                        <p className="mt-1 text-xs text-slate-400">{review.comments}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No reviews for this contribution" />
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
