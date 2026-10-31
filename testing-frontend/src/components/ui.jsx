import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

/** Premium Golden Obsidian UI Components */

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`bento-item relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:border-amber-600/30 hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)] ${className}`}>
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent"></div>
      <div className="relative z-10">
        {(title || actions) && (
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/50 pb-4">
            <div>
              {title && <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-200 uppercase">{title}</h2>}
              {subtitle && <p className="mt-1 font-mono text-[10px] text-zinc-500">{subtitle}</p>}
            </div>
            {actions && <div>{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <div className="bento-item flex flex-col justify-between gap-4 rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl transition-all duration-500 hover:border-amber-600/30">
      <div className="flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-700/50 bg-zinc-800/50 text-zinc-400">
          {Icon && <Icon size={22} />}
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</h3>
        <p className="text-3xl font-bold tracking-tight text-white">
          {value === null || value === undefined ? '—' : value}
        </p>
        {hint && <p className="mt-2 font-mono text-[10px] text-zinc-500">{hint}</p>}
      </div>
    </div>
  );
}

export function Alert({ type = 'error', children }) {
  const isSuccess = type === 'success';
  const styles = isSuccess
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
    : 'border-red-500/20 bg-red-500/10 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]';

  const IconColor = isSuccess ? 'text-emerald-500' : 'text-red-500';

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-medium backdrop-blur-md ${styles}`}>
      <AlertCircle size={18} className={`mt-0.5 shrink-0 ${IconColor}`} />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function EmptyState({ title = 'Telemetry Empty', message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/30 px-6 py-12 text-center transition-colors hover:border-zinc-700 hover:bg-zinc-900/30">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
        <Inbox size={20} className="text-zinc-500" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-300">{title}</p>
      {message && <p className="mt-2 max-w-sm font-mono text-[10px] text-zinc-500">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

const STATUS_STYLES = {
  SUBMITTED: 'bg-zinc-800/80 text-zinc-300 border-zinc-700',
  PENDING_VERIFICATION: 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
  VERIFIED: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  UNDER_AI_ANALYSIS: 'bg-violet-500/10 text-violet-400 border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.15)]',
  UNDER_COMMUNITY_REVIEW: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.15)]',
  DISPUTED: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  OPEN: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  UNDER_REVIEW: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  RESOLVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  APPEALED: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  APPROVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  REQUEST_CHANGES: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  REJECT: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${style}`}
    >
      {status?.replace(/_/g, ' ') || 'UNKNOWN'}
    </span>
  );
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[10px] font-bold uppercase tracking-widest text-zinc-400"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      <div className="relative group">
        {children}
      </div>
      {hint && !error && <p className="font-mono text-[10px] text-zinc-600">{hint}</p>}
      {error && <p className="font-mono text-[10px] text-red-400/90">{error}</p>}
    </div>
  );
}

export function Spinner({ size = 18, className = 'text-amber-500' }) {
  return (
    <Loader2
      size={size}
      className={`animate-spin ${className}`}
      aria-label="Loading telemetry"
    />
  );
}