import { useEffect, useState } from "react";
import { Download, Filter } from "lucide-react";
import { toast } from "../../stores/toastStore";
import { auditAPI } from "../../services/api";

interface AuditLogEntry {
  _id: string;
  command: string;
  status: string;
  startedAt: string;
  agentId?: string;
  stderrSummary?: string;
}

function levelForStatus(status: string) {
  if (status === "FAILED" || status === "TIMEOUT") {
    return { label: "[ERROR]", color: "text-red-400" };
  }
  if (status === "CANCELLED") {
    return { label: "[WARN]", color: "text-yellow-400" };
  }
  return { label: "[INFO]", color: "text-green-400" };
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function SystemLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    auditAPI
      .logs(20)
      .then((response) => {
        if (mounted) {
          setLogs(response.data);
          setError("");
        }
      })
      .catch(() => {
        if (mounted) setError("Could not load system logs");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">System Logs</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toast.success("Export Logs", "Log export started")}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f] transition-colors"
          >
            <Download className="w-4 h-4" /> Export Logs
          </button>
          <button
            onClick={() =>
              toast.info("Filter Logs", "Log filtering coming soon")
            }
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f] transition-colors"
          >
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </div>

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5 font-mono text-sm">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {loading && <p className="text-gray-400">Loading logs...</p>}
          {error && <p className="text-red-400">{error}</p>}
          {!loading && !error && logs.length === 0 && (
            <p className="text-gray-400">No logs yet</p>
          )}
          {!loading &&
            !error &&
            logs.map((log) => {
              const level = levelForStatus(log.status);
              return (
                <div key={log._id} className="flex gap-2 leading-relaxed">
                  <span className="text-gray-500 shrink-0">
                    {formatTimestamp(log.startedAt)}
                  </span>
                  <span className={`font-bold shrink-0 ${level.color}`}>
                    {level.label}
                  </span>
                  <span className="font-semibold shrink-0 text-blue-400">
                    {log.agentId || "control-plane"}
                  </span>
                  <span className="text-gray-300">
                    {log.status} {log.command}
                    {log.stderrSummary ? ` - ${log.stderrSummary}` : ""}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
