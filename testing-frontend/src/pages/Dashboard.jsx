import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, CheckCircle, Folder, Clock, Users, Award, GitPullRequest } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { dashboardApi } from '../services/api';
import { Alert, Spinner } from '../components/ui';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' :
    `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await dashboardApi.developer();
      setData(response.data?.data?.dashboard ?? null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load your dashboard'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <Spinner size={32} className="text-amber-500" />
        <span className="font-mono text-xs tracking-widest text-zinc-500 uppercase">
          Loading your dashboard…
        </span>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-zinc-950 p-8 flex items-center justify-center">
      <div className="max-w-md w-full text-center">
        <Alert className="bg-zinc-900 border-zinc-800/50 text-zinc-400 mb-6">
          {error}
        </Alert>
        <button onClick={load} className="rounded-full bg-zinc-900 border border-zinc-800 px-6 py-3 text-sm font-medium uppercase hover:bg-zinc-800 hover:text-white">
          Try again
        </button>
      </div>
    </div>
  );

  if (!data) return null;

  const rep = data.reputation ?? {};
  const cont = data.contributions ?? {};
  const tr = data.trust ?? {};

  const repScore = rep.initialized === false
    ? '— (not yet calculated)'
    : `${rep.overallScore} / 100`;

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6 rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={20} className="text-amber-500" />
            <h1 className="text-xl font-bold text-white">
              Welcome back, {data.user?.username || user?.username}
            </h1>
          </div>
          <p className="text-sm text-zinc-500">
            Your personal dashboard — all data comes from the live backend
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
            <Award size={20} className="text-amber-500 mb-2" />
            <div>
              <div className="text-xs font-bold tracking-wider text-zinc-500 uppercase">Reputation Score</div>
              <div className="text-2xl font-bold text-white">{repScore}</div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
            <GitPullRequest size={20} className="text-zinc-400 mb-2" />
            <div>
              <div className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                Contributions
              </div>
              <div className="text-2xl font-bold text-white">
                {cont.total ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Trust & Repos */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
            <Users size={20} className="text-zinc-400 mb-2" />
            <div>
              <div className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                Endorsements Given
              </div>
              <div className="text-sm font-bold text-amber-400">{tr.given ?? 0}</div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
            <Folder size={20} className="text-zinc-400 mb-2" />
            <div>
              <div className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                Active Repositories
              </div>
              <div className="text-sm font-bold text-white">{data.repositories ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Recent Contributions */}
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
          <h2 className="text-xs font-bold tracking-wider text-zinc-200 uppercase mb-4">
            Recent Submissions
          </h2>
          {cont.byStatus ? (
            <ul className="space-y-3 text-sm text-zinc-300">
              {Object.entries(cont.byStatus).map(([status, count]) => (
                <li key={status}>
                  <span className="font-medium text-zinc-300">{status}</span>
                  <span className="ml-2 font-bold text-white">{count}</span>
                </li>
              ))}</ul>
          ) : (
            <p className="text-zinc-500 italic">No contributions yet</p>
          )}
        </div>

        {/* Quick Links */}
        <div className="mt-8 pt-6 border-t border-zinc-800/50">
          <div className="grid grid-cols-2 gap-4 text-center">
            <Link to="/contributions" className="group flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 py-4 text-sm font-medium uppercase tracking-wider text-zinc-400 hover:border-amber-600 hover:text-amber-500 transition-colors">
              <GitPullRequest className="mx-auto mb-2 text-amber-500" />
              <span>Submit contribution</span>
            </Link>
            <Link to="/reputation" className="group flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 py-4 text-sm font-medium uppercase tracking-wider text-zinc-400 hover:border-amber-600 hover:text-amber-500 transition-colors">
              <Award className="mx-auto mb-2 text-amber-500" />
              <span>View reputation</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}