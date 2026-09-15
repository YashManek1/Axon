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
  const selectedJobIsSupported = selectedJob?.type === "shell";
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
    if (!selectedJobIsSupported) {
      toast.error("Unavailable in pilot", "Historical HTTP jobs are read-only and cannot be run.");
      return;
    }
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-8 mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">Live execution</h1>
          <p className="text-muted mt-2">Real-time command output streamed over Socket.IO</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            className="bg-bg border border-edge text-ink rounded-sm h-8 px-3 text-sm min-w-0 flex-1 sm:flex-none sm:min-w-[220px]"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
          >
            <option value="">— Select a job —</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>{j.name}</option>
            ))}
          </select>
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm bg-primary text-white transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm" disabled={!selectedJobId || !selectedJobIsSupported || running} onClick={handleRun}>
            <Play size={14} /> {running ? "Dispatching…" : "Run now"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="bg-surface border border-edge rounded-md overflow-hidden flex flex-col h-screen max-h-screen xl:max-h-[420px]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <span className="flex items-center gap-1 text-xs" style={{ color: "#8b95a4" }}>
              {socketLoading
                ? <><span className="w-2 h-2 bg-danger rounded-full animate-pulse" />connecting…</>
                : <><span className="w-2 h-2 bg-success rounded-full animate-pulse" />{selectedJob?.name ?? "no job selected"}</>
              }
            </span>
            <span className="flex-1" />
            <button
              className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm text-muted transition-all hover:text-ink hover:bg-surface-2 text-xs"
              onClick={() => { disconnect(selectedJobId); setTimeout(() => connect(selectedJobId), 50); }}
            >
              <RotateCcw size={13} /> Clear
            </button>
          </div>
          <div
            ref={termRef}
            className="flex-1 overflow-y-auto bg-term-bg font-mono text-xs p-4"
          >
            {!selectedJobId && (
              <div className="text-muted">Select a job to subscribe to its log stream.</div>
            )}
            {jobLogs.length === 0 && selectedJobId && (
              <div className="text-muted">Waiting for output… run the job to see logs.</div>
            )}
            {jobLogs.map((chunk, i) => (
              <div key={i} className="text-ink-2">
                <span className="text-muted">{fmtTs(chunk.timestampMs)}</span>
                <span className={chunk.stream === "stderr" ? "text-danger" : "text-muted"}>
                  {" "}{chunk.stream === "stderr" ? "ERR " : "OUT "}
                </span>
                <span>{chunk.line}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-edge rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
              <span className="font-ui font-bold text-sm text-ink">Execution</span>
              <span className="flex-1" />
              {selectedJob ? (
                selectedJobIsSupported
                  ? <span className="flex items-center gap-1.5 text-xs text-success"><span className="w-1.5 h-1.5 bg-success rounded-full" />ready</span>
                  : <span className="text-xs text-warning">unsupported in pilot</span>
              ) : null}
            </div>
            <div className="p-4 flex flex-col gap-2.75 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Target job</span>
                <span className="font-mono">{selectedJob?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Type</span>
                <span className="font-mono">{selectedJob?.type ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Schedule</span>
                <span className="font-mono">{selectedJob?.schedule ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Socket</span>
                <span className={`font-mono ${socketLoading ? "text-warning" : "text-success"}`}>
                  {socketLoading ? "connecting" : "connected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Log lines</span>
                <span className="font-mono">{jobLogs.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-edge rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
              <span className="font-ui font-bold text-sm text-ink">How live streaming works</span>
            </div>
            <div className="p-4">
              <ol className="flex flex-col gap-0 list-none m-0 p-0">
                {[
                  ["1", "Select a job above"],
                  ["2", "Terminal subscribes to its log stream via Socket.IO"],
                  ["3", "Click Run now — control plane dispatches to agent"],
                  ["4", "stdout / stderr stream back in real-time"],
                  ["5", "Execution sealed to the audit log on completion"],
                ].map(([n, t]) => (
                  <li key={n} className="flex gap-3 py-2.5 border-b border-edge last:border-b-0">
                    <span className="font-mono text-primary text-xs flex-shrink-0">{n}</span>
                    <span className="text-sm text-muted">{t}</span>
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
