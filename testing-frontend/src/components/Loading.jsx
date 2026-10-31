import { Spinner } from './ui';

/** Full-panel loading state used by pages and the protected-route guard. */
export default function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-navy-800 bg-navy-900/50 px-6 py-12 text-sm text-slate-400">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
