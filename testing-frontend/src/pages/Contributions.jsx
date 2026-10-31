import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Brain,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  GitPullRequest,
  Plus,
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Terminal,
  X,
  Code2,
  GitBranch,
  Sparkles,
  Layers,
  Activity
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import {
  aiApi,
  apiErrorMessage,
  apiFieldErrors,
  contributionApi,
  repositoryApi,
  verificationApi,
} from '../services/api';
import { Alert, Spinner } from '../components/ui'; // Assuming these are basic wrappers

const PAGE_SIZE = 10;
const STATUSES = [
  'SUBMITTED', 'PENDING_VERIFICATION', 'VERIFIED',
  'UNDER_AI_ANALYSIS', 'UNDER_COMMUNITY_REVIEW',
  'APPROVED', 'REJECTED', 'DISPUTED',
];
const TYPES = ['FEATURE', 'BUG_FIX', 'DOCUMENTATION', 'REFACTORING', 'TESTING', 'OTHER'];

// Utility to format dates elegantly
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// Premium Premium Badge to match the Golden Brown / Obsidian Theme
const PremiumBadge = ({ status }) => {
  const getStyles = () => {
    if (['APPROVED', 'VERIFIED'].includes(status)) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (['REJECTED', 'DISPUTED'].includes(status)) return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (['UNDER_AI_ANALYSIS', 'PENDING_VERIFICATION'].includes(status)) return 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
    return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${getStyles()}`}>
      {status?.replace(/_/g, ' ') || 'UNKNOWN'}
    </span>
  );
};

// Premium Bento Box with Inner Light and Soft Drop Shadow
const BentoBox = ({ children, className = '', colSpan = 'col-span-1' }) => (
  <div className={`relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:border-amber-600/30 hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)] ${colSpan} ${className}`}>
    {/* Subtle inner top-light for 3D glass effect */}
    <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent"></div>
    <div className="relative z-10">{children}</div>
  </div>
);

// Luxurious Input Field Wrapper
const PremiumField = ({ label, error, children }) => (
  <div className="flex flex-col space-y-2">
    <label className="text-[11px] font-bold uppercase tracking-widest text-amber-600/80">{label}</label>
    {children}
    {error && <span className="text-xs font-medium text-red-400 mt-1 flex items-center gap-1"><X size={12} /> {error}</span>}
  </div>
);

export default function Contributions() {
  const { isAuthenticated } = useAuth();

  const containerRef = useRef(null);
  const detailRef = useRef(null);

  const [scope, setScope] = useState('all');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  const [repositories, setRepositories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    repositoryId: '', githubPRUrl: '', title: '', contributionType: 'BUG_FIX', description: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Elegant staggered entrance
  useGSAP(() => {
    gsap.fromTo(containerRef.current.children,
      { opacity: 0, y: 30, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.15, ease: 'power4.out' }
    );
  }, []);

  useGSAP(() => {
    if (detail && detailRef.current) {
      gsap.fromTo(detailRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'back.out(1.2)' }
      );
    }
  }, [detail]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, limit: PAGE_SIZE, status: status || undefined };
      const response = scope === 'mine' ? await contributionApi.mine(params) : await contributionApi.list(params);
      setItems(response.data?.data ?? []);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to retrieve records'));
    } finally {
      setLoading(false);
    }
  }, [page, scope, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showForm || repositories.length) return;
    repositoryApi.list({ limit: 100 }).then(res => setRepositories(res.data?.data ?? [])).catch(() => setRepositories([]));
  }, [showForm, repositories.length]);

  async function openDetail(id) {
    setDetailLoading(true); setDetail(null);
    try {
      const response = await contributionApi.get(id);
      setDetail(response.data?.data?.contribution ?? null);
    } catch (err) { /* Handle detail error quietly or via toast */ }
    finally { setDetailLoading(false); }
  }

  async function runAction(action) {
    if (!detail) return;
    setBusyAction(action);
    try {
      if (action === 'verify') await verificationApi.verify(detail.id);
      else await aiApi.analyze(detail.id);
      const refreshed = await contributionApi.get(detail.id);
      setDetail(refreshed.data?.data?.contribution ?? detail);
    } catch (err) { /* Error handling */ }
    finally { setBusyAction(''); }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await contributionApi.create({ ...form, description: form.description.trim() || undefined });
      setForm({ repositoryId: '', githubPRUrl: '', title: '', contributionType: 'BUG_FIX', description: '' });
      setShowForm(false); load();
      if (response.data?.data?.contribution?.id) openDetail(response.data.data.contribution.id);
    } catch (err) {
      setFieldErrors(apiFieldErrors(err));
    } finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 selection:bg-amber-500/30 selection:text-amber-200">
      {/* 
        Tip for the ultimate aesthetic: 
        Import <style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');</style>
        and configure your tailwind config to use 'Outfit' for sans and 'JetBrains Mono' for mono.
      */}
      <div ref={containerRef} className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8 font-sans">

        {/* Executive Header */}
        <div className="group relative overflow-hidden rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/50 p-8 sm:p-10 shadow-2xl backdrop-blur-3xl">
          {/* Decorative Gold Gradient Orb */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-600/10 blur-[80px] transition-all duration-700 group-hover:bg-amber-500/20"></div>

          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <span className="text-xs font-bold tracking-[0.2em] text-amber-600 uppercase">Architecture Console</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                Contributions
              </h1>
              <p className="mt-3 max-w-xl text-sm font-light leading-relaxed text-zinc-400">
                Oversee repository integrations, monitor automated code reviews, and validate community pull requests through the centralized ledger.
              </p>
            </div>

            {isAuthenticated && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="group/btn relative flex items-center gap-3 overflow-hidden rounded-full bg-zinc-100 px-8 py-4 text-sm font-bold text-zinc-950 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-200 to-amber-500 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-10"></div>
                {showForm ? <X size={18} className="text-zinc-600" /> : <Plus size={18} className="text-amber-600 transition-transform duration-300 group-hover/btn:rotate-90" />}
                {showForm ? 'Close Editor' : 'New Contribution'}
              </button>
            )}
          </div>
        </div>

        {/* The Submission Editor (Bento Form) */}
        {showForm && isAuthenticated && (
          <form onSubmit={handleSubmit} className="relative overflow-hidden rounded-[2.5rem] border border-amber-900/30 bg-gradient-to-b from-zinc-900 to-zinc-950 p-8 shadow-2xl backdrop-blur-xl sm:p-12">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>

            <div className="mb-10 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                <GitPullRequest size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Initialize Ledger Entry</h2>
                <p className="text-sm font-light text-zinc-500">Submit a new PR for automated verification and AI analysis.</p>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <PremiumField label="Target Repository" error={fieldErrors.repositoryId}>
                <select className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/50 px-5 py-4 text-sm text-zinc-200 focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/50 outline-none transition-all hover:bg-zinc-900" value={form.repositoryId} onChange={(e) => setForm({ ...form, repositoryId: e.target.value })}>
                  <option value="">Select repository...</option>
                  {repositories.map((repo) => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}
                </select>
              </PremiumField>

              <PremiumField label="Classification" error={fieldErrors.contributionType}>
                <select className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/50 px-5 py-4 text-sm text-zinc-200 focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/50 outline-none transition-all hover:bg-zinc-900" value={form.contributionType} onChange={(e) => setForm({ ...form, contributionType: e.target.value })}>
                  {TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
                </select>
              </PremiumField>

              <div className="md:col-span-2">
                <PremiumField label="Pull Request URL" error={fieldErrors.githubPRUrl}>
                  <input className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/50 px-5 py-4 font-mono text-sm text-amber-100 placeholder:text-zinc-600 focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/50 outline-none transition-all hover:bg-zinc-900" value={form.githubPRUrl} onChange={(e) => setForm({ ...form, githubPRUrl: e.target.value })} placeholder="https://github.com/organization/repo/pull/1" />
                </PremiumField>
              </div>

              <div className="md:col-span-2">
                <PremiumField label="Entry Title" error={fieldErrors.title}>
                  <input className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/50 px-5 py-4 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/50 outline-none transition-all hover:bg-zinc-900" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Implement robust caching strategy" />
                </PremiumField>
              </div>

              <div className="md:col-span-2">
                <PremiumField label="Technical Description" error={fieldErrors.description}>
                  <textarea className="min-h-[140px] w-full resize-y rounded-2xl border border-zinc-800 bg-zinc-950/50 px-5 py-4 font-mono text-sm leading-relaxed text-zinc-300 placeholder:text-zinc-700 focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/50 outline-none transition-all hover:bg-zinc-900" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="/** Detail the architectural changes here */" />
                </PremiumField>
              </div>
            </div>

            <div className="mt-10 flex items-center justify-end border-t border-zinc-800/60 pt-8">
              <button type="submit" disabled={submitting} className="relative flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-amber-600 to-amber-500 px-10 py-4 text-sm font-bold text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] disabled:opacity-50">
                {submitting ? <Spinner size={18} className="text-zinc-900" /> : <Layers size={18} />}
                {submitting ? 'Committing...' : 'Commit to Ledger'}
              </button>
            </div>
          </form>
        )}

        {/* Data Grid / Ledger */}
        <div className="rounded-[2.5rem] border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-xl sm:p-8">
          {/* Controls */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
            <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
              <Activity className="text-amber-500" size={24} />
              Ledger Registry
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {isAuthenticated && (
                <div className="flex rounded-full border border-zinc-800 bg-zinc-950 p-1">
                  {['all', 'mine'].map((value) => (
                    <button key={value} onClick={() => setScope(value)} className={`rounded-full px-6 py-2 text-xs font-bold tracking-wider uppercase transition-all ${scope === value ? 'bg-zinc-800 text-amber-500 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
                      {value}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative">
                <select className="appearance-none rounded-full border border-zinc-800 bg-zinc-950 py-2 pl-6 pr-10 text-xs font-bold tracking-wider uppercase text-zinc-300 outline-none focus:border-amber-600/50 transition-all cursor-pointer" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">ALL STATUSES</option>
                  {STATUSES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-500">
                  <ChevronRight size={14} className="rotate-90" />
                </div>
              </div>
            </div>
          </div>

          {/* Table Area */}
          <div className="overflow-hidden rounded-3xl border border-zinc-800/50 bg-zinc-950/50 shadow-inner">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-zinc-900/80 text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
                  <tr>
                    <th className="px-8 py-6">Identifier & Title</th>
                    <th className="px-8 py-6">Repository</th>
                    <th className="px-8 py-6">Classification</th>
                    <th className="px-8 py-6">State</th>
                    <th className="px-8 py-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {items.map((item) => (
                    <tr key={item.id} className="group transition-colors duration-300 hover:bg-zinc-800/30">
                      <td className="px-8 py-5">
                        <p className="font-semibold text-zinc-200 transition-colors group-hover:text-amber-400">{item.title}</p>
                        <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px] text-zinc-500">
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">@{item.contributor?.username ?? 'system'}</span>
                          {item.githubPRUrl && (
                            <a href={item.githubPRUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-amber-700/80 hover:text-amber-500 transition-colors">
                              PR #{item.githubPRNumber} <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 font-mono text-xs text-zinc-400">{item.repository?.fullName ?? '—'}</td>
                      <td className="px-8 py-5">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-zinc-300">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-600/50"></div>
                          {item.contributionType?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-8 py-5"><PremiumBadge status={item.status} /></td>
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => openDetail(item.id)} className="inline-flex items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-800/50 px-4 py-2 font-mono text-[10px] tracking-wider text-zinc-300 transition-all hover:border-amber-600/50 hover:bg-amber-600/10 hover:text-amber-400">
                          INSPECT
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && !loading && (
                    <tr>
                      <td colSpan="5" className="py-24 text-center">
                        <Code2 size={48} className="mx-auto mb-4 text-zinc-800" />
                        <p className="text-lg font-medium text-zinc-500">Ledger is empty</p>
                        <p className="mt-1 text-sm text-zinc-600">No records match the current filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detail View Bento Grid */}
        {detail && (
          <div ref={detailRef} className="scroll-m-12 pt-8">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
                <Terminal size={28} className="text-amber-600" /> Inspector Instance
              </h2>
              <button onClick={() => setDetail(null)} className="group flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20">
                <X size={20} className="transition-transform group-hover:rotate-90" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">

              {/* Core Info Box */}
              <BentoBox colSpan="md:col-span-3 lg:col-span-4" className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-3">
                  <h3 className="text-3xl font-bold tracking-tight text-white">{detail.title}</h3>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-zinc-500">
                    <span className="flex items-center gap-2 text-amber-500/80"><GitBranch size={14} /> {detail.repository?.fullName}</span>
                    <span>PR #{detail.githubPRNumber ?? 'N/A'}</span>
                    <span>{formatDate(detail.submittedAt)}</span>
                  </div>
                </div>

                {isAuthenticated && (
                  <div className="flex gap-3">
                    <button disabled={Boolean(busyAction)} onClick={() => runAction('verify')} className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800/80 px-5 py-3 text-xs font-bold tracking-wider text-white shadow-lg backdrop-blur-md transition-all hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50">
                      {busyAction === 'verify' ? <Spinner size={16} /> : <ShieldCheck size={16} />}
                      RUN VERIFY
                    </button>
                    <button disabled={Boolean(busyAction)} onClick={() => runAction('analyze')} className="relative flex items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 to-amber-500 px-5 py-3 text-xs font-bold tracking-wider text-zinc-950 shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] disabled:opacity-50">
                      {busyAction === 'analyze' ? <Spinner size={16} className="text-zinc-900" /> : <Brain size={16} />}
                      AI ANALYSIS
                    </button>
                  </div>
                )}
              </BentoBox>

              {/* Status Display */}
              <BentoBox colSpan="md:col-span-1 lg:col-span-1" className="flex flex-col items-center justify-center text-center">
                <span className="mb-4 text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">System State</span>
                <PremiumBadge status={detail.status} />
              </BentoBox>

              {/* Technical Description */}
              <BentoBox colSpan="md:col-span-2 lg:col-span-3">
                <span className="mb-4 block text-[10px] font-bold tracking-[0.2em] text-amber-600/80 uppercase">Architectural Summary</span>
                <div className="rounded-2xl border border-zinc-800/50 bg-zinc-950/80 p-5 shadow-inner">
                  <p className="whitespace-pre-line font-mono text-sm leading-relaxed text-zinc-400">
                    {detail.description || '/* No description supplied by the author. */'}
                  </p>
                </div>
              </BentoBox>

              {/* Verification Logs */}
              <BentoBox colSpan="md:col-span-3 lg:col-span-2">
                <div className="mb-6 flex items-center gap-3 border-b border-zinc-800 pb-4">
                  <FileSearch size={20} className="text-zinc-400" />
                  <h3 className="text-sm font-bold tracking-widest text-zinc-200 uppercase">Verification Logs</h3>
                </div>
                {detail.verifications?.length ? (
                  <ul className="space-y-3">
                    {detail.verifications.map((record) => (
                      <li key={record.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
                        <span className="font-mono text-xs text-zinc-300">{record.verificationType}</span>
                        <PremiumBadge status={record.verificationStatus} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-zinc-800">
                    <p className="font-mono text-xs text-zinc-600">No logs generated.</p>
                  </div>
                )}
              </BentoBox>

              {/* AI Models */}
              <BentoBox colSpan="md:col-span-3 lg:col-span-2">
                <div className="mb-6 flex items-center gap-3 border-b border-zinc-800 pb-4">
                  <Brain size={20} className="text-amber-500" />
                  <h3 className="text-sm font-bold tracking-widest text-amber-500 uppercase">Model Intelligence</h3>
                </div>
                {detail.aiAnalyses?.length ? (
                  <ul className="space-y-4">
                    {detail.aiAnalyses.map((analysis) => (
                      <li key={analysis.id} className="relative overflow-hidden rounded-2xl border border-amber-900/30 bg-amber-500/5 p-5">
                        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600"></div>
                        <div className="mb-4 flex items-center justify-between pl-2">
                          <span className="font-mono text-xs text-zinc-300">{analysis.modelVersion}</span>
                          <PremiumBadge status={analysis.analysisStatus} />
                        </div>
                        <div className="mb-4 flex gap-6 pl-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Quality</span>
                            <span className="font-mono text-lg text-emerald-400">{analysis.qualityScore ?? '—'}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Risk Factor</span>
                            <span className="font-mono text-lg text-red-400">{analysis.riskScore ?? '—'}</span>
                          </div>
                        </div>
                        {analysis.explanation && (
                          <div className="mt-4 border-t border-amber-900/20 pl-2 pt-4">
                            <p className="font-mono text-xs leading-relaxed text-amber-200/60">{analysis.explanation}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-zinc-800">
                    <p className="font-mono text-xs text-zinc-600">Awaiting analysis.</p>
                  </div>
                )}
              </BentoBox>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}