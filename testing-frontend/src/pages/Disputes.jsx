import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, ShieldAlert, Terminal, Gavel } from 'lucide-react';

import { apiErrorMessage, apiFieldErrors, disputeApi } from '../services/api';
import { Alert, Card, EmptyState, Field, Spinner, StatusBadge } from '../components/ui';

// Premium Date Formatter
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// Premium Input Styling
const inputBaseClasses = "w-full rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 shadow-inner";

export default function Disputes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ contributionId: '', reason: '', description: '', evidence: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // GET /disputes/me — disputes you filed or resolved
      const response = await disputeApi.mine({ limit: 25 });
      setItems(response.data?.data ?? []);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not synchronize dispute ledger'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function validate() {
    const next = {};
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!form.contributionId.trim()) next.contributionId = 'Contribution ID is required';
    else if (!uuid.test(form.contributionId.trim())) next.contributionId = 'Must be a valid UUID';

    if (!form.reason.trim()) next.reason = 'Reason is required';
    else if (form.reason.trim().length < 5) next.reason = 'Must contain at least 5 characters';

    if (!form.description.trim()) next.description = 'Description is required';
    else if (form.description.trim().length < 10) next.description = 'Must contain at least 10 characters';

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setFormError('');
    setNotice('');
    try {
      const payload = {
        contributionId: form.contributionId.trim(),
        reason: form.reason.trim(),
        description: form.description.trim(),
      };

      if (form.evidence.trim()) {
        try {
          payload.evidence = JSON.parse(form.evidence);
        } catch {
          setFieldErrors({ evidence: 'Evidence matrix must be valid JSON' });
          setSubmitting(false);
          return;
        }
      }

      // POST /disputes
      await disputeApi.create(payload);
      setNotice('Dispute formally filed. Contribution status escalated to DISPUTED; reputation remains locked until resolution.');
      setForm({ contributionId: '', reason: '', description: '', evidence: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setFieldErrors(apiFieldErrors(err));
      setFormError(apiErrorMessage(err, 'Failed to file dispute payload'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* Executive Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-500" />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-amber-600 uppercase">Conflict Resolution Protocol</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dispute Ledger</h1>
          <p className="mt-2 text-xs font-light text-zinc-500">
            Filing a dispute never modifies reputation directly. Final outcomes require verified reviewer resolution.
          </p>
        </div>
        <button
          type="button"
          className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus size={14} className="transition-transform group-hover:rotate-90" />
          Initialize Dispute
        </button>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}

      {/* Form Submission UI */}
      <div className={`transition-all duration-500 ease-in-out ${showForm ? 'max-h-[1000px] opacity-100 mb-8' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <form
          className="bento-item relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl sm:p-8"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>

          <div className="mb-6 flex items-center gap-3 border-b border-zinc-800/50 pb-4">
            <Terminal size={18} className="text-amber-500" />
            <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-200 uppercase">Report Contribution Anomaly</h2>
          </div>

          {formError && <div className="mb-6"><Alert>{formError}</Alert></div>}

          <div className="space-y-5">
            <Field
              label="Target Contribution ID"
              error={fieldErrors.contributionId}
              hint="Copy the UUID string from the Contribution detail matrix"
            >
              <input
                className={`${inputBaseClasses} font-mono text-xs`}
                value={form.contributionId}
                onChange={(e) => setForm((prev) => ({ ...prev, contributionId: e.target.value }))}
                placeholder="c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0"
              />
            </Field>

            <Field label="Primary Reason" error={fieldErrors.reason} hint="5–500 characters">
              <input
                className={inputBaseClasses}
                value={form.reason}
                onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="e.g. Suspected plagiarism or structural flaw"
              />
            </Field>

            <Field label="Detailed Analysis" error={fieldErrors.description} hint="10–5000 characters">
              <textarea
                className={`${inputBaseClasses} min-h-[100px] resize-y`}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Document your observations and technical reasoning for this dispute."
              />
            </Field>

            <Field
              label="Evidence Payload (Optional JSON)"
              error={fieldErrors.evidence}
              hint='Format requirement: {"links":["https://…"]}'
            >
              <textarea
                className={`${inputBaseClasses} min-h-[80px] font-mono text-xs`}
                value={form.evidence}
                onChange={(e) => setForm((prev) => ({ ...prev, evidence: e.target.value }))}
                placeholder='{"links": ["https://github.com/…"]}'
              />
            </Field>

            <div className="flex items-center justify-between pt-4">
              <p className="max-w-xs font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                Self-reporting restricted. Limit: 1 active dispute per reporter/contribution pair.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200"
                  onClick={() => setShowForm(false)}
                >
                  Abort
                </button>
                <button
                  type="submit"
                  className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-amber-500 transition-all hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={submitting}
                >
                  {submitting ? <Spinner size={14} /> : <ShieldAlert size={14} />}
                  {submitting ? 'Transmitting...' : 'Submit Payload'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Main Ledger Area */}
      <Card
        title="Active Resolutions"
        actions={
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:border-amber-600/30 hover:text-amber-500"
            onClick={load}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Sync
          </button>
        }
      >
        {loading ? (
          <div className="flex py-12 flex-col items-center justify-center gap-4">
            <Spinner size={24} className="text-amber-500" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Scanning ledger...</span>
          </div>
        ) : error ? (
          <Alert>{error}</Alert>
        ) : items.length === 0 ? (
          <EmptyState
            title="Ledger Empty"
            message="No active or historical disputes found in your telemetry profile."
          />
        ) : (
          <div className="-mx-6 overflow-x-auto sm:mx-0">
            <table className="min-w-full text-left font-sans">
              <thead className="bg-zinc-900/50">
                <tr>
                  <th className="border-b border-zinc-800 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Target Node</th>
                  <th className="border-b border-zinc-800 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Reason Matrix</th>
                  <th className="border-b border-zinc-800 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">State</th>
                  <th className="border-b border-zinc-800 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500 whitespace-nowrap">Timestamp</th>
                  <th className="border-b border-zinc-800 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {items.map((dispute) => (
                  <tr key={dispute.id} className="group transition-colors hover:bg-zinc-900/30 align-top">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors">
                        {dispute.contribution?.title ?? dispute.contributionId}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-500">
                        {dispute.contribution?.repository?.fullName ?? 'Unknown repository'}
                      </p>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <p className="text-sm text-zinc-300">{dispute.reason}</p>
                      <p className="mt-1.5 line-clamp-2 font-mono text-[10px] text-zinc-500">
                        {dispute.description}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={dispute.status} />
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-zinc-400 whitespace-nowrap">
                      {formatDate(dispute.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      {dispute.resolution ? (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-xs text-zinc-300">{dispute.resolution}</p>
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-amber-500/80">
                            <Gavel size={10} />
                            <span>@{dispute.resolver?.username ?? 'system'}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-4 py-3">
        <ShieldAlert size={14} className="shrink-0 text-amber-500/70" />
        <p className="font-mono text-[10px] tracking-wide text-zinc-400">
          Reviewers can triage and resolve disputes via API (<code className="rounded bg-zinc-950 px-1 py-0.5 text-amber-500/80 border border-zinc-800">PATCH /disputes/:id/status</code>). This console handles filing and read-only telemetry.
        </p>
      </div>
    </div>
  );
}