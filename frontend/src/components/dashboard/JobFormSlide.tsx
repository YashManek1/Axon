import { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, ChevronDown } from "lucide-react";
import { jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import { useQueryClient } from "@tanstack/react-query";
import type { Job, JobSink } from "../../hooks/useDashboardData";
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

export default function JobFormSlide({ open, onClose, editing }: JobFormSlideProps) {
  const queryClient = useQueryClient();
  const [form,   setForm]   = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const update = useCallback(
    (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value })),
    []
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const p    = editing.payload as Record<string, unknown>;
      const sink = editing.sink;
      const noti = editing.notifications;
      const win  = editing.executionWindow;
      setForm({
        name:        editing.name ?? "",
        description: editing.description ?? "",
        type:        editing.type,
        schedule:    editing.schedule ?? "0 * * * *",
        timeout:     editing.timeout ?? 30,
        retryLimit:  editing.retryLimit ?? 3,
        command:     (p?.command as string) ?? "",
        url:         (p?.url as string) ?? "",
        method:      (p?.method as string) ?? "GET",
        headers:     extractHeaders(p?.headers),
        body:        (p?.body as string) ?? "",
        webhookUrl:  editing.webhookUrl ?? "",
        notifyOnSuccess: noti?.onSuccess ?? false,
        notifyOnFailure: noti?.onFailure ?? true,
        recipients:      (noti?.recipients ?? []).join("\n"),
        windowEnabled:   win?.enabled ?? false,
        windowStartTime: win?.startTime ?? "08:00",
        windowEndTime:   win?.endTime ?? "22:00",
        windowDays:      win?.activeDays ?? [],
        sinkType:        sink?.type === "mongo" ? "mongo" : "none",
        sinkUri:         sink?.uri ?? "",
        sinkDatabase:    sink?.databaseName ?? "",
        sinkCollection:  extractSinkCollection(sink),
        sinkFormats:     sink?.exportFormat ?? [],
      });
    } else {
      setForm(defaultForm);
    }
  }, [editing, open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      retryLimit:  form.retryLimit,
      webhookUrl:  form.webhookUrl || null,
      notifications: { onSuccess: form.notifyOnSuccess, onFailure: form.notifyOnFailure, recipients },
      executionWindow: {
        enabled:    form.windowEnabled,
        startTime:  form.windowStartTime,
        endTime:    form.windowEndTime,
        activeDays: form.windowDays,
      },
      sink:
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

  if (!open) return null;

  const slideStyle: React.CSSProperties = {
    position: "absolute", top: 0, right: 0, bottom: 0, width: 540, maxWidth: "94vw",
    background: "var(--surface)", borderLeft: "1px solid var(--border)",
    display: "flex", flexDirection: "column",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(2,8,16,0.6)" }} />
      <div style={slideStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
            {editing ? "Edit job" : "New job"}
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Core ──────────────────────────────────────────────────── */}
          <div className="field">
            <label className="label">Job name</label>
            <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Nightly DB Backup" required />
          </div>

          <div className="field">
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Optional description" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label className="label">Type</label>
              <select className="select input" value={form.type} onChange={(e) => update("type", e.target.value as "shell" | "http")}>
                <option value="shell">Shell</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <div className="field">
              <label className="label">Schedule (cron)</label>
              <input className="input mono" value={form.schedule} onChange={(e) => update("schedule", e.target.value)} placeholder="0 * * * *" required />
            </div>
          </div>

          {form.type === "shell" ? (
            <div className="field">
              <label className="label">Command</label>
              <input className="input mono" value={form.command} onChange={(e) => update("command", e.target.value)} placeholder="pg_dump prod | gzip > /backup.gz" required />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
              <div className="field">
                <label className="label">URL</label>
                <input className="input" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://api.example.com/hook" required />
              </div>
              <div className="field">
                <label className="label">Method</label>
                <select className="select input" value={form.method} onChange={(e) => update("method", e.target.value)}>
                  {["GET","POST","PUT","PATCH","DELETE"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label className="label">Timeout (s)</label>
              <input className="input" type="number" min={1} max={3600} value={form.timeout} onChange={(e) => update("timeout", Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="label">Retry limit</label>
              <input className="input" type="number" min={0} max={10} value={form.retryLimit} onChange={(e) => update("retryLimit", Number(e.target.value))} />
            </div>
          </div>

          {/* ── HTTP request details ──────────────────────────────────── */}
          {form.type === "http" && (
            <details className="form-section">
              <summary><ChevronDown size={13} />HTTP request details</summary>
              <div className="section-body">
                <div>
                  <div className="label" style={{ marginBottom: 8 }}>Headers</div>
                  {form.headers.map((h, i) => (
                    <div key={i} className="header-row" style={{ marginBottom: 6 }}>
                      <input className="input mono" style={{ fontSize: 12 }} value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} placeholder="X-Api-Key" />
                      <input className="input mono" style={{ fontSize: 12 }} value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} placeholder="value" />
                      <button type="button" className="icon-btn danger" onClick={() => removeHeader(i)}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={addHeader}>
                    <Plus size={13} /> Add header
                  </button>
                </div>
                <div className="field">
                  <label className="label">Request body (JSON / text)</label>
                  <textarea
                    className="input mono"
                    style={{ height: 80, fontSize: 12, paddingTop: 8 }}
                    value={form.body}
                    onChange={(e) => update("body", e.target.value)}
                    placeholder={'{"key":"value"}'}
                  />
                </div>
              </div>
            </details>
          )}

          {/* ── On completion ─────────────────────────────────────────── */}
          <details className="form-section">
            <summary><ChevronDown size={13} />On completion</summary>
            <div className="section-body">
              <div className="field">
                <label className="label">Webhook URL</label>
                <input className="input" value={form.webhookUrl} onChange={(e) => update("webhookUrl", e.target.value)} placeholder="https://hooks.example.com/axon" />
                <span className="hint">POST with job status, output, and duration on every run</span>
              </div>
            </div>
          </details>

          {/* ── Notifications ─────────────────────────────────────────── */}
          <details className="form-section">
            <summary><ChevronDown size={13} />Email notifications</summary>
            <div className="section-body">
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "var(--t-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.notifyOnSuccess} onChange={(e) => update("notifyOnSuccess", e.target.checked)} />
                  On success
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "var(--t-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.notifyOnFailure} onChange={(e) => update("notifyOnFailure", e.target.checked)} />
                  On failure
                </label>
              </div>
              <div className="field">
                <label className="label">Recipients (one email per line)</label>
                <textarea
                  className="input"
                  style={{ height: 72, paddingTop: 8 }}
                  value={form.recipients}
                  onChange={(e) => update("recipients", e.target.value)}
                  placeholder={"ops@example.com\nalerts@example.com"}
                />
                <span className="hint">Requires SMTP configured via EMAIL_SMTP_HOST env var</span>
              </div>
            </div>
          </details>

          {/* ── Execution window ──────────────────────────────────────── */}
          <details className="form-section">
            <summary><ChevronDown size={13} />Execution window</summary>
            <div className="section-body">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-sm)", cursor: "pointer" }}>
                <input type="checkbox" checked={form.windowEnabled} onChange={(e) => update("windowEnabled", e.target.checked)} />
                Restrict to time window
              </label>
              {form.windowEnabled && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field">
                      <label className="label">Start time</label>
                      <input className="input" type="time" value={form.windowStartTime} onChange={(e) => update("windowStartTime", e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="label">End time</label>
                      <input className="input" type="time" value={form.windowEndTime} onChange={(e) => update("windowEndTime", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 8 }}>Active days</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {WEEKDAYS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWindowDay(day)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "var(--r-sm)",
                            border: "1px solid var(--border)",
                            fontSize: "var(--t-xs)",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                            background: form.windowDays.includes(day) ? "var(--accent-dim)" : "var(--surface-2)",
                            color: form.windowDays.includes(day) ? "var(--accent)" : "var(--text-muted)",
                            fontWeight: form.windowDays.includes(day) ? 600 : 400,
                          }}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </details>

          {/* ── Data sink ─────────────────────────────────────────────── */}
          <details className="form-section">
            <summary><ChevronDown size={13} />Data sink</summary>
            <div className="section-body">
              <div className="field">
                <label className="label">Sink type</label>
                <select className="select input" value={form.sinkType} onChange={(e) => update("sinkType", e.target.value)}>
                  <option value="none">None</option>
                  <option value="mongo">MongoDB</option>
                </select>
              </div>
              {form.sinkType === "mongo" && (
                <>
                  <div className="field">
                    <label className="label">MongoDB URI</label>
                    <input className="input mono" value={form.sinkUri} onChange={(e) => update("sinkUri", e.target.value)} placeholder="mongodb+srv://..." />
                    <span className="hint">Stored encrypted (AES-256-GCM)</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field">
                      <label className="label">Database</label>
                      <input className="input mono" value={form.sinkDatabase} onChange={(e) => update("sinkDatabase", e.target.value)} placeholder="analytics" />
                    </div>
                    <div className="field">
                      <label className="label">Collection</label>
                      <input className="input mono" value={form.sinkCollection} onChange={(e) => update("sinkCollection", e.target.value)} placeholder="job_outputs" required={form.sinkType === "mongo"} />
                    </div>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 8 }}>Export format</div>
                    <div style={{ display: "flex", gap: 12 }}>
                      {EXPORT_FORMATS.map((fmt) => (
                        <label key={fmt} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", cursor: "pointer" }}>
                          <input type="checkbox" checked={form.sinkFormats.includes(fmt)} onChange={() => toggleSinkFormat(fmt)} />
                          {fmt}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </details>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}