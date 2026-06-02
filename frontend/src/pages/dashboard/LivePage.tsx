import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { useJobs } from "../../hooks/useDashboardData";
import { useAgentSocket } from "../../hooks/useAgentSocket";
import { jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";

function fmtTs(ms: number): string {
  return new Date(ms).toISOString().slice(11, 23);
}

export default function LivePage() {
  const { data: jobs = [] } = useJobs();
  const { connect, disconnect, recentLogs, loading: socketLoading } = useAgentSocket();
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [running, setRunning]  = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  const selectedJob = jobs.find((j) => j._id === selectedJobId);
  const jobLogs     = recentLogs.filter((l) => l.jobId === selectedJobId);

  useEffect(() => {
    if (selectedJobId) {
      connect(selectedJobId);
      return () => { disconnect(selectedJobId); };
    }
  }, [selectedJobId, connect, disconnect]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [jobLogs]);

  const handleRun = async () => {
    if (!selectedJobId) { toast.error("No job", "Select a job first"); return; }
    setRunning(true);
    try {
      await jobsAPI.runNow(selectedJobId);
      toast.success("Dispatched", selectedJob?.name ?? selectedJobId);
    } catch {
      toast.error("Failed", "Could not dispatch job");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live execution</h1>
          <p>Real-time command output streamed over Socket.IO</p>
        </div>
        <div className="actions">
          <select
            className="select input"
            style={{ height: 32, fontSize: "var(--t-sm)", minWidth: 220 }}
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
          >
            <option value="">— Select a job —</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>{j.name}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" disabled={!selectedJobId || running} onClick={handleRun}>
            <Play size={14} /> {running ? "Dispatching…" : "Run now"}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="term" style={{ height: 420, display: "flex", flexDirection: "column" }}>
          <div className="term-head">
            <span className="row gap-2" style={{ fontSize: "var(--t-xs)", color: "#8b95a4" }}>
              {socketLoading
                ? <><span className="live-dot err" />connecting…</>
                : <><span className="live-dot" />{selectedJob?.name ?? "no job selected"}</>
              }
            </span>
            <span className="grow" />
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "var(--t-xs)" }}
              onClick={() => { disconnect(selectedJobId); setTimeout(() => connect(selectedJobId), 50); }}
            >
              <RotateCcw size={13} /> Clear
            </button>
          </div>
          <div
            ref={termRef}
            className="term-body"
            style={{ flex: 1, overflowY: "auto" }}
          >
            {!selectedJobId && (
              <div style={{ color: "#5a6675" }}>Select a job to subscribe to its log stream.</div>
            )}
            {jobLogs.length === 0 && selectedJobId && (
              <div style={{ color: "#5a6675" }}>Waiting for output… run the job to see logs.</div>
            )}
            {jobLogs.map((chunk, i) => (
              <div className="term-line" key={i}>
                <span className="ts">{fmtTs(chunk.timestampMs)}</span>
                <span className={chunk.stream === "stderr" ? "lvl c-err" : "lvl c-dim"}>
                  {chunk.stream === "stderr" ? "ERR " : "OUT "}
                </span>
                <span>{chunk.line}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Execution</span>
              <span className="grow" />
              {selectedJob ? <span className="pill acc"><span className="dot" />ready</span> : null}
            </div>
            <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 11, fontSize: "var(--t-sm)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Target job</span>
                <span className="mono">{selectedJob?.name ?? "—"}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Type</span>
                <span className="mono">{selectedJob?.type ?? "—"}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Schedule</span>
                <span className="mono">{selectedJob?.schedule ?? "—"}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Socket</span>
                <span className="mono" style={{ color: socketLoading ? "var(--warn)" : "var(--ok)" }}>
                  {socketLoading ? "connecting" : "connected"}
                </span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Log lines</span>
                <span className="mono">{jobLogs.length}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><span className="panel-title">How live streaming works</span></div>
            <div className="panel-pad">
              <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 0, margin: 0 }}>
                {[
                  ["1", "Select a job above"],
                  ["2", "Terminal subscribes to its log stream via Socket.IO"],
                  ["3", "Click Run now — control plane dispatches to agent"],
                  ["4", "stdout / stderr stream back in real-time"],
                  ["5", "Execution sealed to the audit log on completion"],
                ].map(([n, t]) => (
                  <li key={n} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="mono" style={{ color: "var(--accent)" }}>{n}</span>
                    <span style={{ fontSize: "var(--t-sm)", color: "var(--text-muted)" }}>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
