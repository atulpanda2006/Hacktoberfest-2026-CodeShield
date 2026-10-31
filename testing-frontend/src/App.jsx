import { useState, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, ShieldCheck, TerminalSquare } from 'lucide-react';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Repositories from './pages/Repositories';
import Contributions from './pages/Contributions';
import Reputation from './pages/Reputation';
import Reviews from './pages/Reviews';
import Disputes from './pages/Disputes';

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar automatically on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300 selection:bg-amber-500/30 selection:text-amber-200">

      {/* Global Ambient Glow for the Golden Obsidian theme */}
      <div className="pointer-events-none absolute left-0 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-600/5 blur-[120px]"></div>
      <div className="pointer-events-none absolute bottom-0 right-0 h-[600px] w-[600px] translate-x-1/3 translate-y-1/3 rounded-full bg-amber-900/10 blur-[150px]"></div>

      {/* Sidebar Component */}
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      {/* Mobile Overlay with Glassmorphism */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-zinc-950/80 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Layout Area */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Navbar onToggleSidebar={() => setSidebarOpen((value) => !value)} />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10 lg:px-8">
          <Outlet />
        </main>

        {/* Premium Executive Footer */}
        <footer className="relative z-20 border-t border-zinc-800/60 bg-zinc-950/80 px-6 py-4 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">

            {/* System Status */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>
              <span className="font-mono text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
                System Online
              </span>
            </div>

            {/* API Endpoint Tracker */}
            <div className="flex items-center gap-4 font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
              <span className="hidden sm:flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-amber-600/80" />
                Secure Connection
              </span>
              <span className="text-zinc-800 hidden sm:inline">|</span>
              <span className="flex items-center gap-1.5">
                <TerminalSquare size={12} className="text-zinc-500" />
                API: <span className="text-amber-500/70">{import.meta.env.VITE_API_BASE_URL || 'localhost:3000/api/v1'}</span>
              </span>
            </div>

          </div>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Authenticated / Layout Routes */}
      <Route element={<AppLayout />}>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="/repositories" element={<Repositories />} />
        <Route path="/contributions" element={<Contributions />} />
        <Route
          path="/reputation"
          element={
            <ProtectedRoute>
              <Reputation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reviews"
          element={
            <ProtectedRoute>
              <Reviews />
            </ProtectedRoute>
          }
        />
        <Route
          path="/disputes"
          element={
            <ProtectedRoute>
              <Disputes />
            </ProtectedRoute>
          }
        />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}