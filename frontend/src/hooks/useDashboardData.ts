import { useQuery } from "@tanstack/react-query";
import { jobsAPI, adminAPI } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export interface Job {
  _id: string;
  name: string;
  type: "http" | "shell";
  schedule: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  retryLimit: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  userId: { username: string; email: string } | string;
  orgId: string | { name: string };
  webhookUrl?: string;
  sink?: { type: string | null; uri: string | null; collection: string | null };
}

export interface HealthData {
  status: string;
  uptime: number;
  dbConnected: boolean;
  dbState: number;
  userCount: number | null;
  timestamp: string;
}

export interface JobStatsData {
  totalJobs: number;
  enabledJobs: number;
  disabledJobs: number;
  jobsRunLast24h: number;
  jobsByOrg: { orgId: string; orgName: string; count: number }[];
}

export interface UserStatsData {
  totalUsers: number;
  users: { username: string; email: string; orgId: string; jobCount: number }[];
}

// Fetch user's own jobs
export function useJobs() {
  return useQuery<Job[]>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await jobsAPI.getAll();
      return res.data;
    },
    refetchInterval: 30000,
  });
}

// Admin: health check
export function useHealth() {
  const { user } = useAuthStore();
  return useQuery<HealthData>({
    queryKey: ["admin", "health"],
    queryFn: async () => {
      const res = await adminAPI.health();
      return res.data;
    },
    enabled: user?.role === "admin",
    refetchInterval: 15000,
  });
}

// Admin: job stats
export function useJobStats() {
  const { user } = useAuthStore();
  return useQuery<JobStatsData>({
    queryKey: ["admin", "jobStats"],
    queryFn: async () => {
      const res = await adminAPI.jobStats();
      return res.data;
    },
    enabled: user?.role === "admin",
    refetchInterval: 30000,
  });
}

// Admin: user stats
export function useUserStats() {
  const { user } = useAuthStore();
  return useQuery<UserStatsData>({
    queryKey: ["admin", "userStats"],
    queryFn: async () => {
      const res = await adminAPI.userStats();
      return res.data;
    },
    enabled: user?.role === "admin",
    refetchInterval: 60000,
  });
}

// Admin: all jobs
export function useAllJobs() {
  const { user } = useAuthStore();
  return useQuery<Job[]>({
    queryKey: ["admin", "allJobs"],
    queryFn: async () => {
      const res = await adminAPI.allJobs();
      return res.data;
    },
    enabled: user?.role === "admin",
    refetchInterval: 30000,
  });
}
