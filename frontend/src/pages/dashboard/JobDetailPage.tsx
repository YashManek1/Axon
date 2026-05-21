import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import LiveLogTerminal from "../../components/dashboard/LiveLogTerminal";
import { auditAPI, jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import type { Job } from "../../hooks/useDashboardData";

interface AuditRecord {
  _id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  exitCode?: number;
  stderrSummary?: string;
}

const historyPageSize = 10;

export default function JobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [historyPage, setHistoryPage] = useState(0);
  const [running, setRunning] = useState(false);

  const jobQuery = useQuery<Job>({
    queryKey: ["jobs", jobId],
    queryFn: async () => {
      const response = await jobsAPI.getById(jobId || "");
      return response.data;
    },
    enabled: Boolean(jobId),
  });

  const historyQuery = useQuery<AuditRecord[]>({
    queryKey: ["audit", "job", jobId, historyPage],
    queryFn: async () => {
      const response = await auditAPI.jobHistory(
        jobId || "",
        historyPageSize,
        historyPage * historyPageSize,
      );
      return response.data;
    },
    enabled: Boolean(jobId),
    refetchInterval: 10000,
  });

  const job = jobQuery.data;
  const createdBy = useMemo(() => {
    if (!job) return "-";
    return typeof job.userId === "object" ? job.userId.username : "-";
  }, [job]);

  const runNow = async () => {
    if (!jobId) return;
    try {
      setRunning(true);
      await jobsAPI.runNow(jobId);
      await queryClient.invalidateQueries({ queryKey: ["audit", "job", jobId] });
      toast.success("Job Triggered", "The job has been queued for immediate execution");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(
        "Trigger Failed",
        axiosErr.response?.data?.message || "Could not trigger the job",
      );
    } finally {
      setRunning(false);
    }
  };

  if (jobQuery.isLoading) {
    return (
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-10 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!job || !jobId) {
    return (
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-10 text-center">
        <p className="text-gray-400">Job not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-sm text-gray-300 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </button>
        <button
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Now
        </button>
      </div>

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <h1 className="text-2xl font-bold text-white mb-4">{job.name}</h1>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Schedule</p>
            <p className="text-white font-mono">{job.schedule}</p>
          </div>
          <div>
            <p className="text-gray-400">Type</p>
            <p className="text-white uppercase">{job.type}</p>
          </div>
          <div>
            <p className="text-gray-400">Status</p>
            <p className="text-white">{job.enabled ? "Active" : "Paused"}</p>
          </div>
          <div>
            <p className="text-gray-400">Created By</p>
            <p className="text-white">{createdBy}</p>
          </div>
          <div>
            <p className="text-gray-400">Job ID</p>
            <p className="text-white font-mono truncate">{job._id}</p>
          </div>
        </div>
      </div>

      <LiveLogTerminal jobId={jobId} orgId={String(job.orgId)} />

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <h2 className="text-xl font-bold text-white mb-4">Execution History</h2>
        {historyQuery.isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
          </div>
        ) : !historyQuery.data || historyQuery.data.length === 0 ? (
          <p className="text-sm text-gray-400">No executions yet</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase border-b border-[#23232f]">
                    <th className="pb-3 pr-4">Started</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Duration</th>
                    <th className="pb-3 pr-4">Exit</th>
                    <th className="pb-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.map((run) => (
                    <tr key={run._id} className="border-b border-[#1a1a24]">
                      <td className="py-3 pr-4 text-sm text-gray-300">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-sm text-white">{run.status}</td>
                      <td className="py-3 pr-4 text-sm text-gray-300">
                        {run.durationMs ?? "-"}ms
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-300">
                        {run.exitCode ?? "-"}
                      </td>
                      <td className="py-3 text-sm text-red-300">
                        {run.stderrSummary || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setHistoryPage((current) => Math.max(current - 1, 0))}
                disabled={historyPage === 0}
                className="px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">Page {historyPage + 1}</span>
              <button
                onClick={() => setHistoryPage((current) => current + 1)}
                disabled={historyQuery.data.length < historyPageSize}
                className="px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
