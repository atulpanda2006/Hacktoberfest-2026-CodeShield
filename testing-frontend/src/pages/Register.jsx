import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus, Shield } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, apiFieldErrors } from '../services/api';
import { Alert, Field, Spinner } from '../components/ui';

export default function Register() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to='/' replace />;

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setServerError('');
  }

  function validate() {
    const next = {};
    if (!form.username.trim()) next.username = 'Username is required';
    else if (form.username.trim().length < 3) next.username = 'At least 3 characters';
    else if (!/^[a-zA-Z0-9_-]+$/.test(form.username.trim()))
      next.username = 'Use letters, numbers, underscore, or hyphen only';

    if (!form.email.trim()) next.email = 'Email is required';
    else if (!/^[\S]+@[\S]+\.[\S]+$/.test(form.email)) next.email = 'Enter a valid email address';

    if (!form.password) next.password = 'Password is required';
    else if (form.password.length < 6) next.password = 'At least 6 characters';

    if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerError('');
    try {
      await register({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      navigate('/', { replace: true });
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setServerError(apiErrorMessage(error, 'Account creation failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-amber-600 text-base font-bold text-zinc-950">
            TN
          </span>
          <h1 className="mt-3 text-xl font-semibold text-slate-100">Create an account</h1>
          <p className="mt-1 text-xs text-slate-400">
            New accounts start as a Developer. You can change your role later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4" noValidate>
          {serverError && <Alert>{serverError}</Alert>}

          <Field label="Username" htmlFor="username" error={errors.username}>
            <input
              id="username"
              className="input"
              value={form.username}
              onChange={(event) => update('username', event.target.value)}
              placeholder="devninja"
              autoComplete="username"
            />
          </Field>

          <Field label="Email" htmlFor="email" error={errors.email}>
            <input
              id="email"
              className="input"
              type="email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            hint="6–128 characters"
          >
            <input
              id="password"
              className="input"
              type="password"
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <Field
            label="Confirm Password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword}
          >
            <input
              id="confirmPassword"
              className="input"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => update('confirmPassword', event.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <button type="submit" className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-3 text-sm font-medium uppercase tracking-widest text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting}>
            {submitting ? <Spinner size={16} /> : <UserPlus size={16} />}
            {submitting ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-xs text-slate-500">
            Already have an account?
            <Link to="/login" className="link">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}