import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  FolderGit2,
  GitPullRequest,
  Award,
  MessageSquare,
  ShieldAlert,
  Activity
} from 'lucide-react';

const links = [
  { to: '/', label: 'Executive Board', icon: LayoutDashboard },
  { to: '/profile', label: 'Identity', icon: User },
  { to: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { to: '/contributions', label: 'Contributions', icon: GitPullRequest },
  { to: '/reputation', label: 'Ledger Score', icon: Award },
  { to: '/reviews', label: 'Peer Reviews', icon: MessageSquare },
  { to: '/disputes', label: 'Active Disputes', icon: ShieldAlert },
];

export default function Sidebar({ open, onNavigate }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-zinc-800/60 bg-zinc-950/95 backdrop-blur-3xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${open ? 'translate-x-0 shadow-[20px_0_50px_rgba(0,0,0,0.5)]' : '-translate-x-full'
        }`}
    >
      {/* Brand Header */}
      <div className="flex h-24 items-center gap-4 border-b border-zinc-800/60 bg-zinc-900/20 px-6">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-bold text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]">
          <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20"></div>
          TN
        </div>
        <div>
          <h1 className="text-xs font-bold tracking-[0.25em] text-white uppercase">
            Trust Network
          </h1>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            </span>
            <p className="font-mono text-[9px] uppercase tracking-widest text-amber-500/80">
              API Console Active
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Matrix */}
      <nav className="space-y-1.5 p-4">
        <p className="mb-4 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
          Main Telemetry
        </p>

        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 overflow-hidden rounded-xl px-4 py-3 text-xs font-bold tracking-wider uppercase transition-all duration-300 ${isActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                : 'text-zinc-400 border border-transparent hover:bg-zinc-800/40 hover:text-zinc-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* Active Indicator Line */}
                {isActive && (
                  <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-amber-400 to-amber-600"></div>
                )}
                <Icon
                  size={16}
                  className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}
                />
                <span className="relative z-10">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Technical Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-800/60 bg-zinc-900/30 p-5">
        <div className="flex items-start gap-3">
          <Activity size={14} className="mt-0.5 shrink-0 text-zinc-500" />
          <p className="font-mono text-[9px] leading-relaxed tracking-widest text-zinc-500 uppercase">
            Golden Obsidian Frontend.<br />
            <span className="text-zinc-400">Directly bound to live API infrastructure.</span>
          </p>
        </div>
      </div>
    </aside>
  );
}