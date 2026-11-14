import { Fragment, useState } from "react";
import { Download, Lock, Loader2 } from "lucide-react";
import { useAuditLogs } from "../../hooks/useDashboardData";
import { auditAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import type { AuditEntry } from "../../hooks/useDashboardData";

type StatusFilter = "all" | "COMPLETED" | "FAILED" | "TIMEOUT" | "PENDING" | "DISPATCHED";

function fmtDur(ms?: number): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function defaultExportRange() {
  const now = Date.now();
  return {
    start: toIsoDate(new Date(now - 7 * 86_400_000)),
    end: toIsoDate(new Date(now)),
  };
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: "completed", FAILED: "failed", TIMEOUT: "timeout",
    PENDING: "pending", DISPATCHED: "dispatched", CANCELLED: "cancelled",
  };
  return <span className={"badge " + (map[status] || "cancelled")}>{status}</span>;
}

function ExitCode({ code }: { code?: number | null }) {
  if (code == null) return <span className="mono" style={{ color: "var(--text-faint)" }}>—</span>;
  return <span className="mono" style={{ color: code === 0 ? "var(--ok)" : "var(--err)" }}>{code}</span>;
}

function ExpandedRow({ entry }: { entry: AuditEntry }) {
  return (
    <div className="px-5 py-4 bg-term-bg border-t border-edge font-mono text-sm">
      <div className="grid gap-1.5 gap-x-4" style={{ gridTemplateColumns: "130px 1fr" }}>
        <span className="text-muted">audit_id</span>
        <span className="text-muted">{entry._id} <span className="text-success">(immutable)</span></span>
        <span className="text-muted">command</span>
        <span className="text-ink break-all">{entry.command}</span>
        <span className="text-muted">trigger</span>
        <span className="text-ink">{entry.triggerType}</span>
        <span className="text-muted">agent</span>
        <span className="text-ink">{String(entry.agentId || "—")}</span>
        <span className="text-muted">started</span>
        <span className="text-ink">{fmtTs(entry.startedAt)}</span>
        {entry.completedAt && (
          <>
            <span className="text-muted">completed</span>
            <span className="text-ink">{fmtTs(entry.completedAt)}</span>
          </>
        )}
        {entry.stdoutSummary && (
          <>
            <span className="text-muted">stdout</span>
            <span className="text-success whitespace-pre-wrap">{entry.stdoutSummary}</span>
          </>
        )}
        {entry.stderrSummary && (
          <>
            <span className="text-muted">stderr</span>
            <span className="text-danger whitespace-pre-wrap">{entry.stderrSummary}</span>
          </>
        )}
        <span className="text-muted">result</span>
        <span>
          <span className={entry.exitCode === 0 ? "text-success" : "text-danger"}>
            exit {entry.exitCode ?? "—"}
          </span>
          {" · "}{fmtDur(entry.durationMs)}
        </span>
      </div>
    </div>
  );
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href     = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const { data: entries = [], isLoading } = useAuditLogs(50);
  const [filter,    setFilter]    = useState<StatusFilter>("all");
  const [query,     setQuery]     = useState("");
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportRange] = useState(defaultExportRange);
  const [exportStart, setExportStart] = useState(exportRange.start);
  const [exportEnd,   setExportEnd]   = useState(exportRange.end);
  const [showExport,  setShowExport]  = useState(false);

  const filtered = entries.filter((e) => {
    const matchStatus = filter === "all" || e.status === filter;
    const matchQuery  = !query || e.command.toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchQuery;
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await auditAPI.export(
        new Date(exportStart).toISOString(),
        new Date(exportEnd + "T23:59:59").toISOString(),
        500,
      );
      downloadJson(res.data, `audit-export-${exportStart}-to-${exportEnd}.json`);
      toast.success("Exported", `${(res.data as unknown[]).length} records downloaded`);
      setShowExport(false);
    } catch {
      toast.error("Export failed", "Check the date range and try again");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-8 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Audit log</h1>
          <p className="text-muted mt-2">Append-only record of every action taken in the control plane</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm text-muted transition-all hover:text-ink hover:bg-surface-2 text-sm" onClick={() => setShowExport((v) => !v)}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {showExport && (
        <div className="bg-surface border border-edge rounded-md p-4 mb-3.5 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">From</label>
            <input className="bg-bg border border-edge text-ink rounded-sm h-8 px-3 text-sm" type="date" value={exportStart} onChange={(e) => setExportStart(e.target.value)} style={{ width: 160 }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">To</label>
            <input className="bg-bg border border-edge text-ink rounded-sm h-8 px-3 text-sm" type="date" value={exportEnd}   onChange={(e) => setExportEnd(e.target.value)}   style={{ width: 160 }} />
          </div>
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm bg-primary text-white transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm" disabled={exporting} onClick={handleExport}>
            {exporting ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Exporting…</> : <><Download size={13} /> Download JSON</>}
          </button>
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm text-muted transition-all hover:text-ink hover:bg-surface-2 text-sm" onClick={() => setShowExport(false)}>Cancel</button>
        </div>
      )}

      <div className="bg-surface-2 border border-edge rounded-md px-4 py-3 flex items-center gap-3 mb-4 text-muted">
        <Lock size={18} className="text-primary flex-shrink-0" />
        <span className="flex-1">
          Records are append-only by policy — immutable fields enforced in application code. Not cryptographically signed in v1.
        </span>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          className="bg-bg border border-edge text-ink rounded-sm h-8 px-3 text-sm"
          style={{ maxWidth: 260 }}
          placeholder="Search command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-0 border border-edge rounded-sm bg-bg overflow-x-auto max-w-full">
          {(["all", "COMPLETED", "FAILED", "TIMEOUT", "PENDING"] as StatusFilter[]).map((f, idx) => (
            <button key={f} className={`px-3 py-1.5 text-xs font-medium transition-all ${
              filter === f ? "bg-primary text-white" : "text-muted hover:text-ink"
            } ${idx > 0 ? "border-l border-edge" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-xs text-muted">{filtered.length} records</span>
      </div>

      <div className="bg-surface border border-edge rounded-md overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Time</th>
              <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Command</th>
              <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Trigger</th>
              <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Agent</th>
              <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Status</th>
              <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Duration</th>
              <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Exit</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center text-muted h-18">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted h-18">No records found</td></tr>
            ) : (
              filtered.map((entry) => (
                <Fragment key={entry._id}>
                  <tr
                    className="cursor-pointer hover:bg-surface-2"
                    onClick={() => setExpanded(expanded === entry._id ? null : entry._id)}
                  >
                    <td className="font-mono text-xs whitespace-nowrap px-3.5 py-2.5 border-b border-edge text-ink-2">{fmtTs(entry.startedAt)}</td>
                    <td className="text-ink max-w-70 px-3.5 py-2.5 border-b border-edge text-ink-2">
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                        {entry.command}
                      </span>
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap px-3.5 py-2.5 border-b border-edge text-ink-2">{entry.triggerType}</td>
                    <td className="font-mono text-xs whitespace-nowrap px-3.5 py-2.5 border-b border-edge text-ink-2">{String(entry.agentId || "—").slice(-8)}</td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2">{statusBadge(entry.status)}</td>
                    <td className="font-mono text-xs whitespace-nowrap px-3.5 py-2.5 border-b border-edge text-ink-2">{fmtDur(entry.durationMs)}</td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2"><ExitCode code={entry.exitCode} /></td>
                  </tr>
                  {expanded === entry._id && (
                    <tr>
                      <td colSpan={7} className="p-0 h-auto">
                        <ExpandedRow entry={entry} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
