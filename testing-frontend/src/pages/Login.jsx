import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Shield, Mail } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, apiFieldErrors } from '../services/api';
import { Alert, Field, Spinner } from '../components/ui';

const inputBaseClasses = "w-full rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 shadow-inner";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setServerError('');
  }

  function validate() {
    const next = {};
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!/^[\S]+@[\S]+\.[\S]+$/.test(form.email)) next.email = 'Enter a valid email address';
    if (!form.password) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerError('');
    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setServerError(apiErrorMessage(error, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10">
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-lg font-bold text-zinc-950 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20"></div>
            TN
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white uppercase">Trust Network</h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Shield size={12} className="text-amber-500" />
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Welcome back
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bento-item relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
          noValidate
        >
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>

          <h2 className="mb-4 text-xs font-bold tracking-[0.2em] text-zinc-200 uppercase border-b border-zinc-800/50 pb-4">
            Sign in to your account
          </h2>

          <div className="space-y-4">
            {serverError && <Alert>{serverError}</Alert>}

            <Field label="Email" htmlFor="email" error={errors.email}>
              <input
                id="email"
                className={inputBaseClasses}
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password" htmlFor="password" error={errors.password}>
              <input
                id="password"
                className={inputBaseClasses}
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                placeholder="••••••••••••"
              />
            </Field>

            <button
              type="submit"
              className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-3 text-sm font-medium uppercase tracking-widest text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? <Spinner size={16} /> : <LogIn size={16} />}
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="mt-4 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
              New here?
              <Link to="/register" className="text-amber-500 hover:text-amber-400 transition-colors">
                Create an account
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}