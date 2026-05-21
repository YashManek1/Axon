import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentSocket, type LogChunk } from "../../hooks/useAgentSocket";

interface LiveLogTerminalProps {
  jobId: string;
  orgId: string;
}

function formatTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString();
}

export default function LiveLogTerminal({ jobId, orgId }: LiveLogTerminalProps) {
  const { connect, disconnect, recentLogs, loading, error } = useAgentSocket();
  const [clearedAt, setClearedAt] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connect(jobId);
    return () => disconnect(jobId);
  }, [connect, disconnect, jobId]);

  const logs = useMemo<LogChunk[]>(
    () =>
      recentLogs.filter(
        (log) => log.jobId === jobId && log.timestampMs >= clearedAt,
      ),
    [recentLogs, jobId, clearedAt],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div
      data-org-id={orgId}
      className="bg-[#111118] border border-[#23232f] rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Live Logs</h2>
        <button
          onClick={() => setClearedAt(Date.now())}
          className="px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f]"
        >
          Clear
        </button>
      </div>
      <div className="h-80 overflow-y-auto bg-[#0a0a0f] rounded-lg p-4 font-mono text-sm">
        {loading && <p className="text-gray-500">Connecting...</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!loading && !error && recentLogs.length === 0 && (
          <p className="text-gray-500">No active execution</p>
        )}
        {!loading && !error && recentLogs.length > 0 && logs.length === 0 && (
          <p className="text-gray-500">Waiting for output...</p>
        )}
        {logs.map((log, index) => (
          <div key={`${log.timestampMs}-${index}`} className="flex gap-2 leading-relaxed">
            <span className="text-gray-500 shrink-0">
              {formatTime(log.timestampMs)}
            </span>
            <span
              className={`font-bold shrink-0 ${
                log.stream === "stderr" ? "text-red-400" : "text-emerald-400"
              }`}
            >
              [{log.stream}]
            </span>
            <span className="text-gray-300 whitespace-pre-wrap">{log.line}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
