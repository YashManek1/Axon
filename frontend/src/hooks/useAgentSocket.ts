import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export interface LogChunk {
  jobId: string;
  orgId?: string;
  stream: "stdout" | "stderr";
  line: string;
  timestampMs: number;
}

interface LogCatchupPayload {
  jobId: string;
  logs: LogChunk[];
}

export function useAgentSocket() {
  const socketRef = useRef<Socket | null>(null);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const [recentLogs, setRecentLogs] = useState<LogChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subscribe = useCallback((jobId: string) => {
    subscriptionsRef.current.add(jobId);
    socketRef.current?.emit("subscribe_job_logs", { jobId });
  }, []);

  const unsubscribe = useCallback((jobId: string) => {
    subscriptionsRef.current.delete(jobId);
    socketRef.current?.emit("unsubscribe_job_logs", { jobId });
  }, []);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? "/", {
      withCredentials: true,
      transports: ["websocket", "polling"],
      auth: { clientType: "ui" },
    });
    socketRef.current = socket;

    const handleConnect = () => {
      setLoading(false);
      setError(null);
      subscriptionsRef.current.forEach((jobId) => {
        socket.emit("subscribe_job_logs", { jobId });
      });
    };
    const handleConnectError = (err: Error) => {
      setLoading(false);
      setError(err.message);
    };
    const handleLogChunk = (chunk: LogChunk) => {
      setRecentLogs((current) => [...current, chunk].slice(-1000));
    };
    const handleCatchup = (payload: LogCatchupPayload) => {
      setRecentLogs((current) => {
        const withoutJob = current.filter((log) => log.jobId !== payload.jobId);
        return [...withoutJob, ...payload.logs].slice(-1000);
      });
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("log_chunk", handleLogChunk);
    socket.on("log_catchup", handleCatchup);
    socket.on("log_subscription_error", (payload: { error?: string }) => {
      setError(payload.error || "Log subscription failed");
    });

    return () => {
      subscriptionsRef.current.forEach((jobId) => {
        socket.emit("unsubscribe_job_logs", { jobId });
      });
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    connect: subscribe,
    disconnect: unsubscribe,
    recentLogs,
    loading,
    error,
  };
}
