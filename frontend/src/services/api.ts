import axios from "axios";
import { useAuthStore, type User } from "../stores/authStore";

let navigateToLogin: (() => void) | null = null;
let refreshPromise: Promise<unknown> | null = null;

export function setAuthNavigationHandler(handler: () => void) {
  navigateToLogin = handler;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/",
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
  getAuditRun: (auditId: string) => api.get("/audit/run/" + auditId),
  getAuditRunLogs: (auditId: string, count = 100) =>
    api.get("/audit/run/" + auditId + "/logs", { params: { count } }),
  export: (startDate: string, endDate: string, limit = 500) =>
    api.get("/audit/export", { params: { startDate, endDate, limit } }),
};

export interface ManualRunPreview {
  jobId: string;
  jobName: string;
  targetAgentId: string;
  targetLabel: string;
  command: string;
  actionVersion: string;
  timeoutMs: number;
  maxOutputBytes: number;
  requiredReleaseId: string;
  notifications: {
    onSuccess: boolean;
    onFailure: boolean;
    recipients: string[];
  };
}

export interface ManualRunPreviewResponse {
  previewId: string;
  previewVersion: 1;
  previewHash: string;
  expiresAt: string;
  preview: ManualRunPreview;
}

export interface ApproveManualRunRequest {
  previewId: string;
  previewHash: string;
}

export interface ManualRunAcceptanceResponse {
  runId: string;
  status: string;
  message?: string;
  idempotentReplay?: boolean;
  queueStateConfirmed?: boolean;
}

export interface SavedRunAttemptEvidence {
  attemptId?: string;
  targetExecutionId?: string;
  operationId?: string;
  sequence?: number;
  status?: string;
  dispatchedAt?: string;
  acknowledgedAt?: string;
  completedAt?: string;
  outcome?: string;
  exitCode?: number;
  reasonCode?: string;
}

export interface SavedRunTransitionEvidence {
  sequence?: number;
  from?: string;
  to?: string;
  at?: string;
  reasonCode?: string;
  source?: string;
  attemptId?: string;
}

export interface SavedRunEvidence {
  runId: string;
  jobId: string;
  targetAgentId?: string;
  status: string;
  requiresReview?: boolean;
  reasonCode?: string;
  createdAt?: string;
  updatedAt?: string;
  queuedAt?: string;
  completedAt?: string;
  transitionSequence?: number;
  attempts?: SavedRunAttemptEvidence[];
  transitions?: SavedRunTransitionEvidence[];
  terminalSummary?: {
    status?: string;
    outcome?: string;
    exitCode?: number;
    reasonCode?: string;
    completedAt?: string;
  };
}

export interface SavedRunEvidenceListResponse {
  runs: SavedRunEvidence[];
  hasMore: boolean;
}

export type ReconciliationBlockedReason =
  | "FEATURE_DISABLED"
  | "READ_ONLY_ACTOR"
  | "NO_SUPPORTED_PROOF"
  | "TARGET_ACCESS_DENIED"
  | "EVIDENCE_UNAVAILABLE";

export interface RunReconciliation {
  runId: string;
  attemptId: string;
  targetAgentId: string;
  status: string;
  transitionSequence: number;
  eligible: boolean;
  blockedReason: ReconciliationBlockedReason | null;
  proof: null | { version: number; proofId: string; recordedAt: string; terminalTransitionSequence: number };
  resolution: null | { resolutionId: string; actorId: string; actorRole: string; recordedAt: string; purpose: string; reason: string };
  originalHoldObservation: "PRESENT" | "ABSENT" | "UNAVAILABLE";
}

export interface RecordReconciliationResolutionRequest {
  proofId: string;
  expectedTransitionSequence: number;
  reason: string;
}

export interface ReconciliationResolutionResponse {
  resolutionId: string;
  runId: string;
  status: "UNKNOWN";
  releaseIntentRecorded: true;
  originalHoldObservation: "ABSENT" | "PRESENT" | "UNAVAILABLE";
  targetAvailability: "NOT_ESTABLISHED";
}

export const jobsAPI = {
  getAll: () => api.get("/jobs/getJobs"),
  getById: (id: string) => api.get("/jobs/getJobById/" + id),
  create: (data: Record<string, unknown>) => api.post("/jobs/createJob", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put("/jobs/updateJob/" + id, data),
  delete: (id: string) => api.delete("/jobs/deleteJob/" + id),
  toggle: (id: string) => api.patch("/jobs/toggleJobStatus/" + id),
  previewRun: (id: string) => api.post<ManualRunPreviewResponse>("/jobs/previewJobRun/" + id),
  runNow: (id: string, approval: ApproveManualRunRequest, idempotencyKey: string) => api.post<ManualRunAcceptanceResponse>(
    "/jobs/runJobNow/" + id,
    approval,
    { headers: { "Idempotency-Key": idempotencyKey } },
  ),
  // Evidence inspection must surface 401/403 to the panel; it must never turn a
  // read into a refresh POST while protected run data is being cleared.
  listRuns: (id: string) => api.get<SavedRunEvidenceListResponse>("/jobs/" + id + "/runs", { skipAuthRefresh: true } as Record<string, unknown>),
  getRun: (id: string, runId: string) => api.get<SavedRunEvidence>("/jobs/" + id + "/runs/" + runId, { skipAuthRefresh: true } as Record<string, unknown>),
  getReconciliation: (id: string, runId: string) => api.get<RunReconciliation>("/jobs/" + id + "/runs/" + runId + "/reconciliation", {
    headers: { "Cache-Control": "no-store" },
    skipAuthRefresh: true,
  } as Record<string, unknown>),
  recordReconciliationResolution: (id: string, runId: string, body: RecordReconciliationResolutionRequest, idempotencyKey: string) => api.post<ReconciliationResolutionResponse>(
    "/jobs/" + id + "/runs/" + runId + "/reconciliation",
    body,
    { headers: { "Idempotency-Key": idempotencyKey, "Cache-Control": "no-store" }, skipAuthRefresh: true } as Record<string, unknown>,
  ),
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
  health:       () => api.get("/admin/health"),
  jobStats:     () => api.get("/admin/job-stats"),
  userStats:    () => api.get("/admin/user-stats"),
  orgAnalytics: () => api.get("/admin/org-analytics"),
  allJobs:      () => api.get("/admin/all-jobs"),
  allUsers:     () => api.get("/admin/all-users"),
};

export const orgApiKeysAPI = {
  list: () => api.get("/admin/org/api-keys"),
  create: (label: string) => api.post("/admin/org/api-keys", { label }),
  revoke: (keyId: string) => api.delete("/admin/org/api-keys/" + keyId),
};

export default api;

// If Axon later renders user-generated HTML, sanitize it at the boundary before
// passing it to dangerouslySetInnerHTML.
