import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import { useQueryClient } from "@tanstack/react-query";
import type { Job } from "../../hooks/useDashboardData";

interface JobFormSlideProps {
  open:    boolean;
  onClose: () => void;
  editing: Job | null;
}

const defaultForm = {
  name:        "",
  description: "",
  type:        "shell" as "shell" | "http",
  schedule:    "0 * * * *",
  command:     "",
  url:         "",
  method:      "GET",
  timeout:     30,
  retryLimit:  3,
};

export default function JobFormSlide({ open, onClose, editing }: JobFormSlideProps) {
  const queryClient = useQueryClient();
  const [form,    setForm]    = useState(defaultForm);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (editing) {
      const payload = editing.payload as Record<string, unknown>;
      setForm({
        name:        editing.name || "",
        description: (editing as unknown as { description?: string }).description || "",
        type:        editing.type,
        schedule:    editing.schedule || "0 * * * *",
        command:     (payload?.command as string) || "",
        url:         (payload?.url as string)     || "",
        method:      (payload?.method as string)  || "GET",
        timeout:     (editing as unknown as { timeout?: number }).timeout    || 30,
        retryLimit:  editing.retryLimit || 3,
      });
    } else {
      setForm(defaultForm);
    }
  }, [editing, open]);

  const update = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload =
      form.type === "shell"
        ? { command: form.command }
        : { url: form.url, method: form.method };

    const body = {
      name:       form.name,
      description:form.description,
      type:       form.type,
      schedule:   form.schedule,
      payload,
      timeout:    form.timeout,
      retryLimit: form.retryLimit,
    };

    try {
      if (editing) {
        await jobsAPI.update(editing._id, body);
        toast.success("Job updated", form.name);
      } else {
        await jobsAPI.create(body);
        toast.success("Job created", form.name);
      }
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      toast.error("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(2,8,16,0.6)" }}
      />
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 520, maxWidth: "94vw",
        background: "var(--surface)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
            {editing ? "Edit job" : "New job"}
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
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

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: "auto" }}>
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
