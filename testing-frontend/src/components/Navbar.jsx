import { Link } from 'react-router-dom';
import { LogIn, LogOut, Menu, UserPlus, Shield, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ onToggleSidebar }) {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-4 border-b border-zinc-800/60 bg-zinc-950/80 px-4 backdrop-blur-2xl lg:px-8 shadow-sm">

      {/* Left Section: Mobile Toggle & System Status */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition-all hover:border-amber-500/30 hover:text-amber-500 lg:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
        >
          <Menu size={18} className="transition-transform duration-300 group-hover:scale-110" />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          <Activity size={14} className="text-zinc-600" />
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Live Telemetry Console <span className="text-zinc-700 mx-1">|</span> Golden Obsidian
          </p>
        </div>
      </div>

      {/* Right Section: Auth & Profile */}
      <div className="flex items-center gap-4 sm:gap-6">
        {isAuthenticated ? (
          <>
            <div className="hidden text-right sm:block">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                {user?.username}
              </p>
              <div className="mt-0.5 flex items-center justify-end gap-1.5">
                <Shield size={10} className="text-amber-500" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-amber-500/80">
                  {user?.role || 'OPERATOR'}
                </p>
              </div>
            </div>

            <div className="h-8 w-px bg-zinc-800/60 hidden sm:block"></div>

            <button
              type="button"
              className="group flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-all hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400"
              onClick={logout}
            >
              <LogOut size={14} className="transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline">Terminate</span>
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              className="group flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-all hover:border-zinc-600 hover:text-white"
            >
              <LogIn size={14} className="transition-transform group-hover:translate-x-0.5" />
              Authenticate
            </Link>
            <Link
              to="/register"
              className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]"
            >
              <UserPlus size={14} className="transition-transform group-hover:scale-110" />
              Initialize
            </Link>
          </>
        )}
      </div>
    </header>
  );
}