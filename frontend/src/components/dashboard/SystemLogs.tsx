import { Download, Filter } from "lucide-react"

interface LogEntry {
  timestamp: string
  level: string
  levelColor: string
  agent: string
  agentColor: string
  message: string
}

const logs: LogEntry[] = [
  { timestamp: "2024-02-05 18:03:42", level: "[INFO]", levelColor: "text-green-400", agent: "rust-agent-01", agentColor: "text-blue-400", message: "Job data-sync-job-4521 completed successfully" },
  { timestamp: "2024-02-05 18:02:15", level: "[DEBUG]", levelColor: "text-gray-400", agent: "rust-agent-03", agentColor: "text-blue-400", message: "Starting ML training job-8842 with 4 GPU cores" },
  { timestamp: "2024-02-05 18:01:38", level: "[WARN]", levelColor: "text-yellow-400", agent: "rust-agent-03", agentColor: "text-blue-400", message: "Memory usage at 82.4% - approaching threshold" },
  { timestamp: "2024-02-05 17:58:22", level: "[INFO]", levelColor: "text-green-400", agent: "rust-agent-02", agentColor: "text-blue-400", message: "Backup job-2341 completed in 8m 12s" },
  { timestamp: "2024-02-05 17:51:45", level: "[DEPLOY]", levelColor: "text-purple-400", agent: "rust-agent-02", agentColor: "text-blue-400", message: "Agent deployed to eu-west-2b region" },
  { timestamp: "2024-02-05 17:46:18", level: "[ERROR]", levelColor: "text-red-400", agent: "rust-agent-01", agentColor: "text-blue-400", message: "Job validation-job-7723 failed: Schema mismatch at line 342" },
  { timestamp: "2024-02-05 17:39:51", level: "[INFO]", levelColor: "text-green-400", agent: "rust-agent-03", agentColor: "text-blue-400", message: "Indexing job-5512 completed successfully" },
  { timestamp: "2024-02-05 17:28:33", level: "[DEBUG]", levelColor: "text-gray-400", agent: "rust-agent-01", agentColor: "text-blue-400", message: "Updated to version v2.4.1" },
]

export default function SystemLogs() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">System Logs</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f] transition-colors">
            <Download className="w-4 h-4" /> Export Logs
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f] transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </div>

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5 font-mono text-sm">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2 leading-relaxed">
              <span className="text-gray-500 shrink-0">{log.timestamp}</span>
              <span className={`font-bold shrink-0 ${log.levelColor}`}>{log.level}</span>
              <span className={`font-semibold shrink-0 ${log.agentColor}`}>{log.agent}</span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
