import { useState, useCallback } from "react";
import { X, Plus, Trash2, ChevronDown } from "lucide-react";
import { jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents, type Job, type JobSink } from "../../hooks/useDashboardData";
import { track } from "@vercel/analytics";

interface JobFormSlideProps {
  open:    boolean;
  onClose: () => void;
  editing: Job | null;
}

interface HeaderPair { key: string; value: string }

const WEEKDAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"] as const;
const EXPORT_FORMATS = ["CSV", "JSON", "Excel"] as const;

const defaultForm = {
  name:       "",
  description: "",
  type:        "shell" as "shell" | "http",
  schedule:    "0 * * * *",
  timeout:     30,
  retryLimit:  3,
  targetAgentId: "",
  command:     "",
  url:         "",
  method:      "GET",
  headers:     [] as HeaderPair[],
  body:        "",
  webhookUrl:  "",
  notifyOnSuccess: false,
  notifyOnFailure: true,
  recipients:      "",
  windowEnabled:   false,
  windowStartTime: "08:00",
  windowEndTime:   "22:00",
  windowDays:      [] as string[],
  sinkType:        "none" as "none" | "mongo",
  sinkUri:         "",
  sinkDatabase:    "",
  sinkCollection:  "",
  sinkFormats:     [] as string[],
};

function extractHeaders(rawHeaders: unknown): HeaderPair[] {
  if (!rawHeaders || typeof rawHeaders !== "object" || Array.isArray(rawHeaders)) return [];
  return Object.entries(rawHeaders as Record<string, string>).map(([key, value]) => ({ key, value }));
}

function extractSinkCollection(sink: JobSink | undefined): string {
  return sink?.collectionName ?? sink?.collection ?? "";
}

function createForm(editing: Job | null) {
  if (!editing) {
    return {
      ...defaultForm,
      headers: [],
      windowDays: [],
      sinkFormats: [],
    };
  }

  const p = editing.payload as Record<string, unknown>;
  const sink = editing.sink;
  const noti = editing.notifications;
  const win = editing.executionWindow;
  const target = editing.targetAgentId;

  return {
    name: editing.name ?? "",
    description: editing.description ?? "",
    type: editing.type,
    schedule: editing.schedule ?? "0 * * * *",
    timeout: editing.timeout ?? 30,
    retryLimit: editing.retryLimit ?? 3,
    targetAgentId: typeof target === "object" && target ? target._id : target ?? "",
    command: (p?.command as string) ?? "",
    url: (p?.url as string) ?? "",
    method: (p?.method as string) ?? "GET",
    headers: extractHeaders(p?.headers),
    body: (p?.body as string) ?? "",
    webhookUrl: editing.webhookUrl ?? "",
    notifyOnSuccess: noti?.onSuccess ?? false,
    notifyOnFailure: noti?.onFailure ?? true,
    recipients: (noti?.recipients ?? []).join("\n"),
    windowEnabled: win?.enabled ?? false,
    windowStartTime: win?.startTime ?? "08:00",
    windowEndTime: win?.endTime ?? "22:00",
    windowDays: win?.activeDays ?? [],
    sinkType: sink?.type === "mongo" ? "mongo" : "none",
    sinkUri: sink?.uri ?? "",
    sinkDatabase: sink?.databaseName ?? "",
    sinkCollection: extractSinkCollection(sink),
    sinkFormats: sink?.exportFormat ?? [],
  };
}

export default function JobFormSlide({ open, onClose, editing }: JobFormSlideProps) {
  if (!open) return null;

  return (
    <JobFormContent
      key={editing ? `${editing._id}:${editing.updatedAt ?? ""}` : "new"}
      onClose={onClose}
      editing={editing}
    />
  );
}

function JobFormContent({ onClose, editing }: Omit<JobFormSlideProps, "open">) {
  const queryClient = useQueryClient();
  const agentsQuery = useAgents();
  const [form,   setForm]   = useState(() => createForm(editing));
  const [saving, setSaving] = useState(false);

  const update = useCallback(
    (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value })),
    []
  );

  const toggleWindowDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      windowDays: prev.windowDays.includes(day)
        ? prev.windowDays.filter((d) => d !== day)
        : [...prev.windowDays, day],
    }));
  };

  const toggleSinkFormat = (format: string) => {
    setForm((prev) => ({
      ...prev,
      sinkFormats: prev.sinkFormats.includes(format)
        ? prev.sinkFormats.filter((f) => f !== format)
        : [...prev.sinkFormats, format],
    }));
  };

  const addHeader = () =>
    setForm((prev) => ({ ...prev, headers: [...prev.headers, { key: "", value: "" }] }));

  const removeHeader = (index: number) =>
    setForm((prev) => ({ ...prev, headers: prev.headers.filter((_, i) => i !== index) }));

  const updateHeader = (index: number, field: "key" | "value", value: string) =>
    setForm((prev) => {
      const headers = [...prev.headers];
      headers[index] = { ...headers[index], [field]: value };
      return { ...prev, headers };
    });

  if (editing?.type === "http") {
    return (
      <div className="fixed inset-0 z-50">
        <div onClick={onClose} className="absolute inset-0 bg-black/60" />
        <div className="absolute top-0 right-0 bottom-0 w-screen max-w-96 bg-surface border-l border-edge flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-edge">
            <div className="text-4xl font-bold text-ink">HTTP job unavailable</div>
            <button className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-transparent text-muted transition-all hover:text-ink hover:bg-surface-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="flex-1 px-6 py-6">
            <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink-2" role="alert">
              HTTP jobs are read-only historical records in the pilot profile. They cannot be edited, enabled, or run.
            </div>
            <p className="mt-4 text-sm text-muted">View execution history from the job details page.</p>
          </div>
          <div className="flex justify-end px-6 py-4 border-t border-edge">
            <button type="button" className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm border border-edge text-muted transition-all hover:text-ink hover:bg-surface-2 text-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.type === "shell" && !form.targetAgentId) {
      toast.error("Target required", "Choose the exact agent that may run this shell command.");
      return;
    }
    setSaving(true);

    const httpHeaders = form.headers.reduce<Record<string, string>>((acc, { key, value }) => {
      if (key.trim()) acc[key.trim()] = value;
      return acc;
    }, {});

    const payload =
      form.type === "shell"
        ? { command: form.command }
        : {
            url:     form.url,
            method:  form.method,
            headers: Object.keys(httpHeaders).length > 0 ? httpHeaders : undefined,
            body:    form.body || undefined,
          };

    const recipients = form.recipients
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      name:        form.name,
      description: form.description,
      type:        form.type,
      schedule:    form.schedule,
      payload,
      timeout:     form.timeout,
      targetAgentId: form.type === "shell" ? form.targetAgentId : null,
      enabled: form.type === "shell" ? false : undefined,
      retryLimit:  form.type === "shell" ? 0 : form.retryLimit,
      webhookUrl:  form.type === "shell" ? null : form.webhookUrl || null,
      notifications: { onSuccess: form.notifyOnSuccess, onFailure: form.notifyOnFailure, recipients },
      executionWindow: {
        enabled:    form.type === "http" && form.windowEnabled,
        startTime:  form.windowStartTime,
        endTime:    form.windowEndTime,
        activeDays: form.windowDays,
      },
      sink: form.type === "shell"
        ? { type: null, uri: null, collectionName: null }
        :
        form.sinkType === "mongo" && form.sinkUri && form.sinkCollection
          ? {
              type:           "mongo",
              uri:            form.sinkUri,
              databaseName:   form.sinkDatabase,
              collectionName: form.sinkCollection,
              exportFormat:   form.sinkFormats,
            }
          : { type: null, uri: null, collectionName: null },
    };

    try {
      if (editing) {
        await jobsAPI.update(editing._id, body);
        toast.success("Job updated", form.name);
        track("job_updated", { type: form.type });
      } else {
        await jobsAPI.create(body);
        toast.success("Job created", form.name);
        track("job_created", { type: form.type });
      }
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Save failed";
      toast.error("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="absolute top-0 right-0 bottom-0 w-screen max-w-96 bg-surface border-l border-edge flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-edge">
          <div className="text-4xl font-bold text-ink">
            {editing ? "Edit job" : "New job"}
          </div>
          <button className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-transparent text-muted transition-all hover:text-ink hover:bg-surface-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-3.5">

          {/* ── Core ──────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">Job name</label>
            <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Nightly DB Backup" required />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">Description</label>
            <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Optional description" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">Type</label>
              <select aria-label="Job type" className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm appearance-none" value="shell" disabled>
                <option value="shell">Approved shell action</option>
              </select>
            </div>
            {form.type === "http" && <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">Schedule (cron)</label>
              <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm font-mono" value={form.schedule} onChange={(e) => update("schedule", e.target.value)} placeholder="0 * * * *" required />
            </div>}
          </div>

          {form.type === "shell" ? (
            <>
            <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink-2" role="note">
              Shell jobs are manual-only. Scheduling, retries, webhooks, and data sinks are unavailable while execution protocol v2 is in use.
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">Command</label>
              <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm font-mono" value={form.command} onChange={(e) => update("command", e.target.value)} placeholder="pg_dump prod | gzip > /backup.gz" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5" htmlFor="target-agent">Target agent</label>
              {agentsQuery.isLoading ? (
                <p className="text-sm text-muted" role="status">Loading agents…</p>
              ) : agentsQuery.isError ? (
                <p className="text-sm text-danger" role="alert">Agents could not be loaded. Refresh and choose a target before saving.</p>
              ) : agentsQuery.data?.length ? (
                <select id="target-agent" aria-label="Target agent" className="w-full bg-bg border border-edge text-ink rounded-sm h-12 px-3 text-sm" value={form.targetAgentId} onChange={(e) => update("targetAgentId", e.target.value)} required>
                  <option value="">Choose the exact agent</option>
                  {agentsQuery.data.map((agent) => {
                    const hostname = agent.systemInfo?.hostname ?? "hostname unavailable";
                    return <option key={agent._id} value={agent._id}>{agent.name} · {hostname} · {agent.status} · {agent._id}</option>;
                  })}
                </select>
              ) : (
                <p className="text-sm text-muted" role="status">No active agents are available. Register an agent before creating a shell job.</p>
              )}
              {form.targetAgentId && <p className="mt-1 text-xs font-mono text-muted">Stable target ID: {form.targetAgentId}</p>}
            </div>
            </>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">URL</label>
                <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://api.example.com/hook" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">Method</label>
                <select className="bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm appearance-none" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }} value={form.method} onChange={(e) => update("method", e.target.value)}>
                  {["GET","POST","PUT","PATCH","DELETE"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">Timeout (s)</label>
              <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" type="number" min={1} max={3600} value={form.timeout} onChange={(e) => update("timeout", Number(e.target.value))} />
            </div>
            {form.type === "http" && <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">Retry limit</label>
              <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" type="number" min={0} max={10} value={form.retryLimit} onChange={(e) => update("retryLimit", Number(e.target.value))} />
            </div>}
          </div>

          {/* ── HTTP request details ──────────────────────────────────── */}
          {form.type === "http" && (
            <details className="border border-edge rounded-sm">
              <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-ink hover:bg-surface-2 flex items-center gap-2"><ChevronDown size={13} />HTTP request details</summary>
              <div className="px-3 py-3 space-y-3 bg-surface-2">
                <div>
                  <div className="text-xs font-medium text-ink-2 mb-2">Headers</div>
                  {form.headers.map((h, i) => (
                    <div key={i} className="flex gap-2 mb-1.5">
                      <input className="flex-1 bg-bg border border-edge text-ink rounded-sm px-2 py-1.5 text-xs font-mono" value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} placeholder="X-Api-Key" />
                      <input className="flex-1 bg-bg border border-edge text-ink rounded-sm px-2 py-1.5 text-xs font-mono" value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} placeholder="value" />
                      <button type="button" className="inline-flex items-center justify-center w-6 h-6 rounded-sm text-muted transition-all hover:text-danger hover:bg-surface" onClick={() => removeHeader(i)} aria-label="Delete header"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <button type="button" className="inline-flex items-center justify-center gap-2 font-ui font-medium h-7 px-2 rounded-sm text-muted transition-all hover:text-ink hover:bg-surface-2 text-xs mt-1" onClick={addHeader}>
                    <Plus size={13} /> Add header
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">Request body (JSON / text)</label>
                  <textarea
                    className="w-full bg-bg border border-edge text-ink rounded-sm px-2 py-2 text-xs font-mono"
                    style={{ height: 80 }}
                    value={form.body}
                    onChange={(e) => update("body", e.target.value)}
                    placeholder={'{"key":"value"}'}
                  />
                </div>
              </div>
            </details>
          )}

          {/* ── On completion ─────────────────────────────────────────── */}
          {form.type === "http" && <details className="border border-edge rounded-sm">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-ink hover:bg-surface-2 flex items-center gap-2"><ChevronDown size={13} />On completion</summary>
            <div className="px-3 py-3 space-y-3 bg-surface-2">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">Webhook URL</label>
                <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" value={form.webhookUrl} onChange={(e) => update("webhookUrl", e.target.value)} placeholder="https://hooks.example.com/axon" />
                <span className="text-xs text-muted mt-1 block">POST with job status, output, and duration on every run</span>
              </div>
            </div>
          </details>}

          {/* ── Notifications ─────────────────────────────────────────── */}
          {form.type === "http" && <details className="border border-edge rounded-sm">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-ink hover:bg-surface-2 flex items-center gap-2"><ChevronDown size={13} />Email notifications</summary>
            <div className="px-3 py-3 space-y-3 bg-surface-2">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.notifyOnSuccess} onChange={(e) => update("notifyOnSuccess", e.target.checked)} />
                  On success
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.notifyOnFailure} onChange={(e) => update("notifyOnFailure", e.target.checked)} />
                  On failure
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">Recipients (one email per line)</label>
                <textarea
                  className="w-full bg-bg border border-edge text-ink rounded-sm px-2 py-2 text-sm"
                  style={{ height: 72 }}
                  value={form.recipients}
                  onChange={(e) => update("recipients", e.target.value)}
                  placeholder={"ops@example.com\nalerts@example.com"}
                />
                <span className="text-xs text-muted mt-1 block">Requires SMTP configured via EMAIL_SMTP_HOST env var</span>
              </div>
            </div>
          </details>}

          {/* ── Execution window ──────────────────────────────────────── */}
          {form.type === "http" && <details className="border border-edge rounded-sm">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-ink hover:bg-surface-2 flex items-center gap-2"><ChevronDown size={13} />Execution window</summary>
            <div className="px-3 py-3 space-y-3 bg-surface-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.windowEnabled} onChange={(e) => update("windowEnabled", e.target.checked)} />
                Restrict to time window
              </label>
              {form.windowEnabled && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-2 mb-1.5">Start time</label>
                      <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" type="time" value={form.windowStartTime} onChange={(e) => update("windowStartTime", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-2 mb-1.5">End time</label>
                      <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm" type="time" value={form.windowEndTime} onChange={(e) => update("windowEndTime", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-ink-2 mb-2">Active days</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {WEEKDAYS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWindowDay(day)}
                          className={`px-2.5 py-1 rounded-sm text-xs font-mono cursor-pointer transition-all ${
                            form.windowDays.includes(day)
                              ? "bg-primary text-white"
                              : "bg-surface-2 border border-edge text-muted hover:text-ink"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </details>}

          {/* ── Data sink ─────────────────────────────────────────────── */}
          {form.type === "http" && <details className="border border-edge rounded-sm">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-ink hover:bg-surface-2 flex items-center gap-2"><ChevronDown size={13} />Data sink</summary>
            <div className="px-3 py-3 space-y-3 bg-surface-2">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">Sink type</label>
                <select className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm appearance-none" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }} value={form.sinkType} onChange={(e) => update("sinkType", e.target.value)}>
                  <option value="none">None</option>
                  <option value="mongo">MongoDB</option>
                </select>
              </div>
              {form.sinkType === "mongo" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-ink-2 mb-1.5">MongoDB URI</label>
                    <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm font-mono" value={form.sinkUri} onChange={(e) => update("sinkUri", e.target.value)} placeholder="mongodb+srv://..." />
                    <span className="text-xs text-muted mt-1 block">Stored encrypted (AES-256-GCM)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-2 mb-1.5">Database</label>
                      <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm font-mono" value={form.sinkDatabase} onChange={(e) => update("sinkDatabase", e.target.value)} placeholder="analytics" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-2 mb-1.5">Collection</label>
                      <input className="w-full bg-bg border border-edge text-ink rounded-sm h-10 px-3 text-sm font-mono" value={form.sinkCollection} onChange={(e) => update("sinkCollection", e.target.value)} placeholder="job_outputs" required={form.sinkType === "mongo"} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-ink-2 mb-2">Export format</div>
                    <div className="flex gap-3">
                      {EXPORT_FORMATS.map((fmt) => (
                        <label key={fmt} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={form.sinkFormats.includes(fmt)} onChange={() => toggleSinkFormat(fmt)} />
                          {fmt}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </details>}

          <div className="flex gap-2.5 justify-end pt-2">
            <button type="button" className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm text-muted transition-all hover:text-ink hover:bg-surface-2 text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm bg-primary text-white transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
