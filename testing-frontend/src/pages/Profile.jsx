import { useCallback, useEffect, useState } from 'react';
import {
  Pencil, RefreshCw, Save, UserPlus, X, User, Activity, Github, Shield, Terminal, Award, Zap, Cpu,
  KeyRound, Link2, Unlink, CheckCircle2, AlertTriangle, ExternalLink, Lock,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, apiFieldErrors, profileApi, githubApi } from '../services/api';
import { Alert, Field, Spinner } from '../components/ui';

const EMPTY_FORM = {
  fullName: '',
  bio: '',
  githubUsername: '',
  githubProfileUrl: '',
  skills: '',
  experienceLevel: 'JUNIOR',
};

const SKILLS_LIMIT = 30;

function toForm(profile) {
  return {
    fullName: profile.fullName ?? '',
    bio: profile.bio ?? '',
    githubUsername: profile.githubUsername ?? '',
    githubProfileUrl: profile.githubProfileUrl ?? '',
    skills: (profile.skills ?? []).join(', '),
    experienceLevel: profile.experienceLevel ?? 'JUNIOR',
  };
}

function toPayload(form) {
  const skills = form.skills
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, SKILLS_LIMIT);

  const payload = {
    fullName: form.fullName.trim() || null,
    bio: form.bio.trim() || null,
    skills,
    experienceLevel: form.experienceLevel,
  };

  if (form.githubUsername.trim()) payload.githubUsername = form.githubUsername.trim();
  if (form.githubProfileUrl.trim()) payload.githubProfileUrl = form.githubProfileUrl.trim();

  return payload;
}

// Premium Input Styling
const inputBaseClasses = "w-full rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 shadow-inner font-sans";

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

/**
 * Per-user GitHub credentials.
 *
 * The token is typed here, sent once to the backend (which validates it against
 * GitHub and stores it encrypted) and is never returned or kept in browser
 * storage. Repository ownership checks always run as this account.
 */
function GitHubConnection() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showTokenForm, setShowTokenForm] = useState(false);
  const [token, setToken] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await githubApi.connection();
      setStatus(response.data?.data ?? null);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load your GitHub connection'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Result of the optional OAuth round-trip (?github=connected|error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('github');

    if (result === 'connected') {
      setNotice(`GitHub account @${params.get('username') || ''} connected successfully.`);
    } else if (result === 'error') {
      setError(params.get('reason') || 'GitHub authorization failed. Please try again.');
    }

    if (result) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function handleConnect(event) {
    event.preventDefault();
    setFieldError('');
    setNotice('');
    setError('');

    const value = token.trim();
    if (value.length < 20) {
      setFieldError('That does not look like a GitHub token. Copy it again from GitHub.');
      return;
    }

    setBusy(true);
    try {
      const response = await githubApi.connect(value);
      const username = response.data?.data?.account?.githubUsername;
      setToken('');
      setShowTokenForm(false);
      setNotice(`GitHub account @${username} connected. Repository checks will now run as this account.`);
      await load({ silent: true });
    } catch (err) {
      setFieldError(apiErrorMessage(err, 'GitHub rejected this token'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect your GitHub account? Stored credentials are deleted.')) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await githubApi.disconnect();
      setNotice('GitHub account disconnected. Public trust data stays available.');
      await load({ silent: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not disconnect GitHub'));
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth() {
    setBusy(true);
    setError('');
    try {
      const response = await githubApi.oauthStart();
      const url = response.data?.data?.url;
      if (!url) throw new Error('no url');
      window.location.assign(url);
    } catch (err) {
      setError(apiErrorMessage(err, 'GitHub OAuth is not configured on this server'));
      setBusy(false);
    }
  }

  const connected = Boolean(status?.connected);
  const account = status?.account;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl sm:p-8">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/50 pb-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">
          <Github size={14} className="text-amber-500" /> GitHub Connection
        </h2>
        <span
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${
            connected
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-zinc-700 bg-zinc-900 text-zinc-500'
          }`}
        >
          {connected ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-zinc-500">
        Connect your own GitHub account so repository ownership checks run as <em>you</em>. Your
        token is validated by GitHub, encrypted with AES-256-GCM and stored against your account
        only — it is never shown again or shared with other users.
      </p>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert type="success">{notice}</Alert></div>}

      {loading && !status ? (
        <div className="flex items-center gap-3 text-zinc-500">
          <Spinner size={16} className="text-amber-500" />
          <span className="font-mono text-[10px] uppercase tracking-widest">Checking credentials…</span>
        </div>
      ) : (
        <>
          {status && !status.encryptionConfigured && (
            <div className="mb-4">
              <Alert type="error">
                Server-side token encryption is not configured. Set GITHUB_TOKEN_ENCRYPTION_KEY on
                the backend before connecting an account.
              </Alert>
            </div>
          )}

          {connected && account && (
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              {[
                ['GitHub handle', `@${account.githubUsername}`, Github],
                ['Connected', formatDate(account.connectedAt), Link2],
                [
                  'Token status',
                  status.tokenValid === true
                    ? 'Valid'
                    : status.tokenValid === false
                      ? 'Rejected — reconnect'
                      : 'Unverified',
                  status.tokenValid === false ? AlertTriangle : KeyRound,
                ],
                [
                  'API quota',
                  status.rateLimit?.remaining != null
                    ? `${status.rateLimit.remaining} / ${status.rateLimit.limit} left this hour`
                    : 'Unknown',
                  Activity,
                ],
                [
                  'Scopes',
                  account.scopes?.length ? account.scopes.join(', ') : 'Fine-grained token (no scopes reported)',
                  Lock,
                ],
                ['Token type', account.tokenType || 'PAT', Shield],
              ].map(([label, value, Icon]) => (
                <div key={label} className="rounded-xl border border-transparent bg-zinc-950/30 p-4 transition-colors hover:border-zinc-800/50">
                  <dt className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <Icon size={12} className="text-zinc-600" /> {label}
                  </dt>
                  <dd className="mt-2 truncate text-sm font-medium text-zinc-200">{value}</dd>
                </div>
              ))}
            </div>
          )}

          {connected && status.tokenValid === false && (
            <div className="mb-4">
              <Alert type="error">
                GitHub rejected the stored token. Update it below to restore repository checks.
              </Alert>
            </div>
          )}

          {(!connected || showTokenForm) && (
            <form onSubmit={handleConnect} className="space-y-4">
              <Field
                label={connected ? 'Replace personal access token' : 'Personal access token'}
                error={fieldError}
                hint="Fine-grained token with read access to metadata, or a classic token with repo/public_repo"
              >
                <div className="relative">
                  <KeyRound size={14} className="absolute left-3.5 top-3.5 text-zinc-600" />
                  <input
                    type="password"
                    className={`${inputBaseClasses} pl-9 font-mono text-xs`}
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setFieldError('');
                    }}
                    placeholder="github_pat_… or ghp_…"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy || (status && !status.encryptionConfigured)}
                  />
                </div>
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={busy || !token.trim()}
                  className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-amber-500 transition-all hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? <Spinner size={14} /> : <Link2 size={14} />}
                  {busy ? 'Validating…' : connected ? 'Save new token' : 'Connect GitHub'}
                </button>

                {showTokenForm && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowTokenForm(false);
                      setToken('');
                      setFieldError('');
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                  >
                    <X size={12} /> Cancel
                  </button>
                )}
              </div>

              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-amber-500"
              >
                Create a token on GitHub <ExternalLink size={11} />
              </a>
            </form>
          )}

          {connected && !showTokenForm && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowTokenForm(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:border-amber-500/30 hover:text-amber-400"
                disabled={busy}
              >
                <KeyRound size={13} /> Update token
              </button>
              <button
                type="button"
                onClick={() => load()}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-700"
                disabled={busy || loading}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Re-check
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-red-950/40"
                disabled={busy}
              >
                <Unlink size={13} /> Disconnect
              </button>
            </div>
          )}

          {!connected && status?.oauthConfigured && (
            <div className="mt-4 border-t border-zinc-800/60 pt-4">
              <button
                type="button"
                onClick={handleOAuth}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
              >
                <Github size={13} /> Connect with GitHub OAuth
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function Profile() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await profileApi.mine();
      const nextProfile = response.data?.data?.profile ?? null;
      setProfile(nextProfile);
      setMissing(false);
      if (nextProfile) setForm(toForm(nextProfile));
    } catch (err) {
      if (err.response?.status === 404) {
        setProfile(null);
        setMissing(true);
      } else {
        setError(apiErrorMessage(err, 'Could not synchronize identity matrix'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError('');
  }

  function validate() {
    const next = {};
    if (form.githubUsername && !/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(form.githubUsername.trim())) {
      next.githubUsername = 'Invalid GitHub username structure';
    }
    if (form.fullName && form.fullName.trim().length > 100) next.fullName = 'Maximum 100 characters exceeded';
    if (form.bio.length > 2000) next.bio = 'Maximum 2000 characters exceeded';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setFormError('');
    setNotice('');
    try {
      const payload = toPayload(form);
      const response = missing
        ? await profileApi.create(payload)
        : await profileApi.updateMine(payload);

      const saved = response.data?.data?.profile;
      setNotice(missing ? 'Identity profile established.' : 'Identity profile synchronized.');
      setMissing(false);
      setEditing(false);
      if (saved) {
        setProfile((prev) => ({ ...(prev ?? {}), ...saved }));
        setForm(toForm(saved));
      }
      load();
    } catch (err) {
      setFieldErrors(apiFieldErrors(err));
      setFormError(apiErrorMessage(err, 'Failed to write identity profile'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <Spinner size={32} className="text-amber-500" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Decrypting identity matrix...</span>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-4">
        <Alert type="error">{error}</Alert>
        <button type="button" className="group flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200" onClick={load}>
          <RefreshCw size={14} className="group-hover:animate-spin" /> Retry Connection
        </button>
      </div>
    );
  }

  const stats = profile?.stats;
  const showForm = editing || missing;

  return (
    <div className="space-y-8">

      {/* Executive Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <User size={16} className="text-amber-500" />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-amber-600 uppercase">Operator Identity</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Profile Matrix</h1>
          <p className="mt-2 text-xs font-light text-zinc-500">
            Node: <span className="font-mono text-amber-500/80">{user?.username}</span> <span className="mx-1 text-zinc-700">|</span> Clearance: <span className="font-mono uppercase text-zinc-400">{user?.role}</span>
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            Modify Identity
          </button>
        )}
      </div>

      {notice && <Alert type="success">{notice}</Alert>}

      <GitHubConnection />

      {missing && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 py-16 text-center shadow-inner">
          <Terminal size={32} className="mb-4 text-zinc-700" />
          <h3 className="text-sm font-bold tracking-widest text-zinc-200 uppercase">Identity Matrix Uninitialized</h3>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
            The core system indicates a 404 for this account's developer profile. Initialize your telemetry parameters below.
          </p>
        </div>
      )}

      {/* Telemetry Stats Grid */}
      {profile && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Contributions', value: stats?.contributions?.total ?? 0, icon: Activity },
            { label: 'Verified', value: stats?.contributions?.verified ?? 0, icon: Shield },
            { label: 'Repositories', value: stats?.repositories ?? 0, icon: Github },
            { label: 'Reputation', value: profile.stats?.reputation?.overallScore ?? '—', icon: Award, hint: stats?.reputation ? 'Ledger score' : 'Pending calc' },
          ].map((stat, idx) => (
            <div key={idx} className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5 shadow-lg backdrop-blur-md transition-colors hover:border-amber-500/20 hover:bg-zinc-900/60">
              <div className="absolute -right-4 -top-4 text-zinc-800/30">
                <stat.icon size={64} />
              </div>
              <div className="relative z-10">
                <p className="font-mono text-[10px] font-bold tracking-widest text-zinc-500 uppercase">{stat.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-zinc-100">{stat.value}</span>
                  {stat.hint && <span className="font-mono text-[9px] uppercase tracking-widest text-amber-500/60">{stat.hint}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Profile Display Matrix */}
      {profile && !showForm && (
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl sm:p-8">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>

          <h3 className="mb-6 flex items-center gap-2 border-b border-zinc-800/50 pb-4 text-xs font-bold tracking-[0.2em] text-zinc-200 uppercase">
            <Cpu size={14} className="text-amber-500" /> Identity Parameters
          </h3>

          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {[
              ['Full Designation', profile.fullName, User],
              ['GitHub Handle', profile.githubUsername, Github],
              ['Avatar URI', profile.githubProfileUrl, Zap],
              ['Clearance Level', profile.experienceLevel, Shield],
            ].map(([label, value, Icon]) => (
              <div key={label} className="group rounded-xl bg-zinc-950/30 p-4 transition-colors hover:bg-zinc-950/50 border border-transparent hover:border-zinc-800/50">
                <dt className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  <Icon size={12} className="text-zinc-600 group-hover:text-amber-500/70 transition-colors" /> {label}
                </dt>
                <dd className="mt-2 truncate text-sm font-medium text-zinc-200">{value || <span className="text-zinc-700">—</span>}</dd>
              </div>
            ))}

            <div className="sm:col-span-2 rounded-xl bg-zinc-950/30 p-4 border border-transparent hover:border-zinc-800/50 transition-colors">
              <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Operational Bio</dt>
              <dd className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                {profile.bio || <span className="text-zinc-700">—</span>}
              </dd>
            </div>

            <div className="sm:col-span-2 rounded-xl bg-zinc-950/30 p-4 border border-transparent hover:border-zinc-800/50 transition-colors">
              <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Combat Skills</dt>
              <dd className="mt-3 flex flex-wrap gap-2">
                {profile.skills?.length ? (
                  profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-500/90 shadow-[0_0_10px_rgba(245,158,11,0.05)] transition-all hover:bg-amber-500/10"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-700">—</span>
                )}
              </dd>
            </div>

            <div className="rounded-xl bg-zinc-950/30 p-4 border border-transparent hover:border-zinc-800/50 transition-colors">
              <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Peer Reviews Acquired</dt>
              <dd className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-bold text-zinc-200">{stats?.reviewsReceived ?? 0}</span>
                <span className="font-mono text-[9px] uppercase text-zinc-600">Total</span>
              </dd>
            </div>

            <div className="rounded-xl bg-zinc-950/30 p-4 border border-transparent hover:border-zinc-800/50 transition-colors">
              <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Trust Accumulated</dt>
              <dd className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-bold text-zinc-200">{stats?.trust?.received ?? 0}</span>
                {stats?.trust?.averageTrustLevel && (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-amber-500/60">
                    Lvl {stats.trust.averageTrustLevel} Avg
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Editor Form */}
      <div className={`transition-all duration-500 ease-in-out ${showForm ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <form className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl sm:p-8" onSubmit={handleSave} noValidate>
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>

          <div className="mb-6 flex items-center justify-between border-b border-zinc-800/50 pb-4">
            <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-zinc-200 uppercase">
              <Terminal size={14} className="text-amber-500" />
              {missing ? 'Initialize Identity' : 'Reconfigure Identity'}
            </h2>
            {!missing && (
              <button
                type="button"
                className="group flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition-colors hover:border-red-900/50 hover:bg-red-900/10 hover:text-red-400"
                onClick={() => {
                  setEditing(false);
                  setFormError('');
                  setFieldErrors({});
                  setForm(toForm(profile));
                }}
              >
                <X size={12} className="transition-transform group-hover:rotate-90" /> Abort
              </button>
            )}
          </div>

          {formError && <div className="mb-6"><Alert>{formError}</Alert></div>}

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Full Designation" error={fieldErrors.fullName}>
              <input
                className={inputBaseClasses}
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
                placeholder="Ada Lovelace"
              />
            </Field>

            <Field
              label="GitHub Handle"
              error={fieldErrors.githubUsername}
              hint="Required for repository mapping"
            >
              <div className="relative">
                <Github size={14} className="absolute left-3.5 top-3.5 text-zinc-600" />
                <input
                  className={`${inputBaseClasses} pl-9 font-mono`}
                  value={form.githubUsername}
                  onChange={(e) => update('githubUsername', e.target.value)}
                  placeholder="octocat"
                />
              </div>
            </Field>

            <Field label="Avatar URI" error={fieldErrors.githubProfileUrl}>
              <input
                className={`${inputBaseClasses} font-mono text-xs`}
                value={form.githubProfileUrl}
                onChange={(e) => update('githubProfileUrl', e.target.value)}
                placeholder="https://github.com/octocat"
              />
            </Field>

            <Field label="Clearance Level" error={fieldErrors.experienceLevel}>
              <select
                className={`${inputBaseClasses} appearance-none font-mono uppercase tracking-wider`}
                value={form.experienceLevel}
                onChange={(e) => update('experienceLevel', e.target.value)}
              >
                {['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL'].map((level) => (
                  <option key={level} value={level} className="bg-zinc-900 text-zinc-200">
                    {level}
                  </option>
                ))}
              </select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Operational Bio" error={fieldErrors.bio} hint="Maximum 2000 characters limit">
                <textarea
                  className={`${inputBaseClasses} min-h-[100px] resize-y`}
                  value={form.bio}
                  onChange={(e) => update('bio', e.target.value)}
                  placeholder="Detail your operational focus..."
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field
                label="Combat Skills"
                error={fieldErrors.skills}
                hint={`Comma delineated array, capacity: ${SKILLS_LIMIT}`}
              >
                <input
                  className={inputBaseClasses}
                  value={form.skills}
                  onChange={(e) => update('skills', e.target.value)}
                  placeholder="Node.js, PostgreSQL, React"
                />
              </Field>
            </div>
          </div>

          <div className="mt-8 flex justify-end border-t border-zinc-800/60 pt-6">
            <button
              type="submit"
              className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving}
            >
              {saving ? <Spinner size={16} /> : missing ? <UserPlus size={16} /> : <Save size={16} />}
              {saving ? 'Transmitting…' : missing ? 'Establish Profile' : 'Commit Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}