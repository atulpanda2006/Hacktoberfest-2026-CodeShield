import { useCallback, useEffect, useState } from 'react';
import { Award, RefreshCw } from 'lucide-react';

import { apiErrorMessage, reputationApi } from '../services/api';
import Loading from '../components/Loading';
import { Alert, Card, EmptyState, Spinner, StatCard } from '../components/ui';

const COMPONENT_LABELS = {
  quality: 'Contribution quality',
  reliability: 'Reliability',
  consistency: 'Consistency',
  community: 'Community validation',
  impact: 'Verified impact',
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function ComponentBar({ name, score, weight }) {
  const hasScore = typeof score === 'number';
  const percent = hasScore ? Math.max(0, Math.min(100, score)) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-300">
          {COMPONENT_LABELS[name] ?? name}
          <span className="ml-2 text-slate-500">
            {hasScore ? `${score}/100` : 'no data'}
          </span>
        </span>
        <span className="text-slate-500">{Math.round((weight ?? 0) * 100)}% weight</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-800">
        <div
          className={`h-full rounded-full ${hasScore ? 'bg-accent-500' : 'bg-navy-700'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function Reputation() {
  const [reputation, setReputation] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [recalculating, setRecalculating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // GET /reputation/me returns the stored score and the userId we need next.
      const reputationResponse = await reputationApi.mine();
      const nextReputation = reputationResponse.data?.data?.reputation ?? null;
      setReputation(nextReputation);

      if (nextReputation?.userId) {
        const [breakdownResponse, historyResponse] = await Promise.all([
          reputationApi.breakdown(nextReputation.userId),
          reputationApi.history(nextReputation.userId, { limit: 10 }),
        ]);
        setBreakdown(breakdownResponse.data?.data?.breakdown ?? null);
        setHistory(historyResponse.data?.data ?? []);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load reputation'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function recalculate() {
    if (!reputation?.userId) return;
    setRecalculating(true);
    setNotice('');
    setActionError('');
    try {
      // POST /reputation/recalculate/:userId — idempotent for unchanged evidence
      const response = await reputationApi.recalculate(reputation.userId, {
        reason: 'Recalculated from the testing frontend',
      });
      const result = response.data?.data?.result;
      setNotice(
        result?.changed
          ? `Reputation recalculated (${result.history?.previousScore ?? 0} → ${result.history?.newScore ?? result.reputation?.overallScore}).`
          : 'No new evidence; the stored reputation is unchanged.'
      );
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Recalculation failed'));
    } finally {
      setRecalculating(false);
    }
  }

  if (loading) return <Loading label="Loading reputation…" />;

  if (error) {
    return (
      <div className="space-y-4">
        <Alert>{error}</Alert>
        <button type="button" className="btn-secondary" onClick={load}>
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  if (!reputation) {
    return <EmptyState title="No reputation returned by the backend" />;
  }

  const components = breakdown?.components ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Reputation</h1>
          <p className="mt-1 text-xs text-slate-400">
            Scores are calculated by the backend engine — this page only displays them.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={recalculate} disabled={recalculating}>
          {recalculating ? <Spinner size={14} /> : <RefreshCw size={15} />}
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </button>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Overall score"
          value={reputation.overallScore}
          hint={reputation.initialized === false ? 'Live estimate (not stored yet)' : 'Stored score'}
          icon={Award}
        />
        {/* A null component means "no evidence yet" — show a dash, never a fake 0. */}
        <StatCard
          label="Quality"
          value={components.quality === null || components.quality === undefined ? '—' : components.quality}
          hint={components.quality == null ? 'No AI analysis yet' : undefined}
        />
        <StatCard
          label="Reliability"
          value={
            components.reliability === null || components.reliability === undefined
              ? '—'
              : components.reliability
          }
          hint={components.reliability == null ? 'No contributions yet' : undefined}
        />
        <StatCard
          label="Community"
          value={
            components.community === null || components.community === undefined
              ? '—'
              : components.community
          }
          hint={components.community == null ? 'No reviews received yet' : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Score breakdown"
          subtitle={breakdown?.explanation ?? 'Weights are applied only to components with evidence.'}
        >
          {breakdown ? (
            <div className="space-y-4">
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
                <ComponentBar
                  key={key}
                  name={key}
                  score={components[key]}
                  weight={breakdown.weights?.[key]}
                />
              ))}

              {Number(breakdown.misconductPenalty) > 0 && (
                <Alert>
                  Misconduct penalty applied: −{breakdown.misconductPenalty} points from confirmed
                  dispute resolutions.
                </Alert>
              )}

              <div className="border-t border-navy-800 pt-3 text-xs text-slate-400">
                <p>
                  Impact component:{' '}
                  <span className="text-slate-200">{components.impact ?? 'no data'}</span>
                </p>
                <p className="mt-1">
                  Contributions considered: {breakdown.totalContributions ?? 0} · Last calculated:{' '}
                  {formatDate(breakdown.lastCalculatedAt)}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState title="Breakdown unavailable" />
          )}
        </Card>

        <Card title="Score history" subtitle="Every change recorded by the backend">
          {history.length ? (
            <ul className="divide-y divide-navy-800">
              {history.map((entry) => (
                <li key={entry.id} className="py-2.5 first:pt-0">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-200">
                      {entry.previousScore} → {entry.newScore}
                    </span>
                    <span
                      className={
                        entry.changeAmount > 0
                          ? 'text-emerald-300'
                          : entry.changeAmount < 0
                            ? 'text-rose-300'
                            : 'text-slate-400'
                      }
                    >
                      {entry.changeAmount > 0 ? '+' : ''}
                      {entry.changeAmount}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {entry.reason} · {entry.sourceType} · {formatDate(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No history yet"
              message="History appears once the backend recalculates a changed score."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
