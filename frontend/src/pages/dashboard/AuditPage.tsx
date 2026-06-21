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
    <div style={{ padding: "16px 20px", background: "var(--term-bg)", borderTop: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "6px 16px" }}>
        <span style={{ color: "var(--text-faint)" }}>audit_id</span>
        <span style={{ color: "var(--text-faint)" }}>{entry._id} <span style={{ color: "var(--ok)" }}>(immutable)</span></span>
        <span style={{ color: "var(--text-faint)" }}>command</span>
        <span style={{ color: "var(--text)", wordBreak: "break-all" }}>{entry.command}</span>
        <span style={{ color: "var(--text-faint)" }}>trigger</span>
        <span style={{ color: "var(--text)" }}>{entry.triggerType}</span>
        <span style={{ color: "var(--text-faint)" }}>agent</span>
        <span style={{ color: "var(--text)" }}>{String(entry.agentId || "—")}</span>
        <span style={{ color: "var(--text-faint)" }}>started</span>
        <span style={{ color: "var(--text)" }}>{fmtTs(entry.startedAt)}</span>
        {entry.completedAt && (
          <>
            <span style={{ color: "var(--text-faint)" }}>completed</span>
            <span style={{ color: "var(--text)" }}>{fmtTs(entry.completedAt)}</span>
          </>
        )}
        {entry.stdoutSummary && (
          <>
            <span style={{ color: "var(--text-faint)" }}>stdout</span>
            <span style={{ color: "var(--ok)", whiteSpace: "pre-wrap" }}>{entry.stdoutSummary}</span>
          </>
        )}
        {entry.stderrSummary && (
          <>
            <span style={{ color: "var(--text-faint)" }}>stderr</span>
            <span style={{ color: "var(--err)", whiteSpace: "pre-wrap" }}>{entry.stderrSummary}</span>
          </>
        )}
        <span style={{ color: "var(--text-faint)" }}>result</span>
        <span>
          <span style={{ color: entry.exitCode === 0 ? "var(--ok)" : "var(--err)" }}>
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
  const [exportStart, setExportStart] = useState(toIsoDate(new Date(Date.now() - 7 * 86_400_000)));
  const [exportEnd,   setExportEnd]   = useState(toIsoDate(new Date()));
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
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Append-only record of every action taken in the control plane</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowExport((v) => !v)}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {showExport && (
        <div className="panel" style={{ padding: 16, marginBottom: 14, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div className="field">
            <label className="label" style={{ fontSize: "var(--t-xs)" }}>From</label>
            <input className="input" type="date" value={exportStart} onChange={(e) => setExportStart(e.target.value)} style={{ height: 32, width: 160 }} />
          </div>
          <div className="field">
            <label className="label" style={{ fontSize: "var(--t-xs)" }}>To</label>
            <input className="input" type="date" value={exportEnd}   onChange={(e) => setExportEnd(e.target.value)}   style={{ height: 32, width: 160 }} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={exporting} onClick={handleExport}>
            {exporting ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Exporting…</> : <><Download size={13} /> Download JSON</>}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowExport(false)}>Cancel</button>
        </div>
      )}

      <div className="banner info" style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <Lock size={18} style={{ color: "var(--accent)" }} />
        <span className="grow">
          Records are append-only by policy — immutable fields enforced in application code. Not cryptographically signed in v1.
        </span>
      </div>

      <div className="filterbar">
        <input
          className="input"
          style={{ maxWidth: 260, height: 32 }}
          placeholder="Search command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="seg">
          {(["all", "COMPLETED", "FAILED", "TIMEOUT", "PENDING"] as StatusFilter[]).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
        <span className="grow" />
        <span className="dep-line">{filtered.length} records</span>
      </div>

      <div className="panel">
        <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Time</th>
              <th>Command</th>
              <th>Trigger</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Exit</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-faint)", height: 72 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-faint)", height: 72 }}>No records found</td></tr>
            ) : (
              filtered.map((entry) => (
                <Fragment key={entry._id}>
                  <tr
                    className="clickable"
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpanded(expanded === entry._id ? null : entry._id)}
                  >
                    <td className="mono" style={{ fontSize: "var(--t-xs)" }}>{fmtTs(entry.startedAt)}</td>
                    <td style={{ color: "var(--text)", maxWidth: 280 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.command}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: "var(--t-xs)" }}>{entry.triggerType}</td>
                    <td className="mono" style={{ fontSize: "var(--t-xs)" }}>{String(entry.agentId || "—").slice(-8)}</td>
                    <td>{statusBadge(entry.status)}</td>
                    <td className="mono" style={{ fontSize: "var(--t-xs)" }}>{fmtDur(entry.durationMs)}</td>
                    <td><ExitCode code={entry.exitCode} /></td>
                  </tr>
                  {expanded === entry._id && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, height: "auto" }}>
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
