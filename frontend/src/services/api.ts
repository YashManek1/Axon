import axios from "axios";
import { useAuthStore, type User } from "../stores/authStore";

let navigateToLogin: (() => void) | null = null;
let refreshPromise: Promise<unknown> | null = null;

export function setAuthNavigationHandler(handler: () => void) {
  navigateToLogin = handler;
}

const api = axios.create({
  baseURL: "/",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh
    ) {
      originalRequest._retry = true;

      try {
        refreshPromise =
          refreshPromise ||
          api.post("/user/refresh", undefined, { skipAuthRefresh: true } as Record<string, unknown>);
        const refreshResponse = (await refreshPromise) as { data?: { user?: unknown } };
        refreshPromise = null;

        if (refreshResponse.data?.user) {
          useAuthStore.getState().login(refreshResponse.data.user as User);
        }

        return api(originalRequest);
      } catch (refreshError) {
        refreshPromise = null;
        useAuthStore.getState().logout();
        navigateToLogin?.();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export const authAPI = {
  login: (data: { email: string; password: string }) =>
    api.post("/user/login", data),
  register: (data: {
    username: string;
    email: string;
    password: string;
    orgName: string;
    orgDescription?: string;
  }) => api.post("/user/register", data),
  logout: () =>
    api.post("/user/logout", undefined, { skipAuthRefresh: true } as Record<string, unknown>),
  refresh: () =>
    api.post("/user/refresh", undefined, { skipAuthRefresh: true } as Record<string, unknown>),
};

export const auditAPI = {
  recent: (limit = 8) => api.get("/audit/recent", { params: { limit } }),
  logs: (limit = 20) => api.get("/audit/logs", { params: { limit } }),
  jobHistory: (jobId: string, limit = 10, skip = 0) =>
    api.get("/audit/job/" + jobId, { params: { limit, skip } }),
};

export const jobsAPI = {
  getAll: () => api.get("/jobs/getJobs"),
  getById: (id: string) => api.get("/jobs/getJobById/" + id),
  create: (data: Record<string, unknown>) => api.post("/jobs/createJob", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put("/jobs/updateJob/" + id, data),
  delete: (id: string) => api.delete("/jobs/deleteJob/" + id),
  toggle: (id: string) => api.patch("/jobs/toggleJobStatus/" + id),
  runNow: (id: string) => api.post("/jobs/runJobNow/" + id),
};

export const agentsAPI = {
  getAll: () => api.get("/agents/getAgents"),
  getById: (id: string) => api.get("/agents/getAgent/" + id),
  register: (data: { name: string; hardwareUuid: string }, orgApiKey: string) =>
    api.post("/agents/register", data, {
      headers: { "X-Axon-API-Key": orgApiKey },
      skipAuthRefresh: true,
    } as Record<string, unknown>),
  rotateKey: (id: string) => api.post("/agents/" + id + "/rotate-key"),
  decommission: (id: string) => api.delete("/agents/" + id),
};

export const adminAPI = {
  health: () => api.get("/admin/health"),
  jobStats: () => api.get("/admin/job-stats"),
  userStats: () => api.get("/admin/user-stats"),
  allJobs: () => api.get("/admin/all-jobs"),
  allUsers: () => api.get("/admin/all-users"),
};

export default api;

// If Axon later renders user-generated HTML, sanitize it at the boundary before
// passing it to dangerouslySetInnerHTML.
