/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "../pages/dashboard/JobDetailPage";
import { auditAPI, jobsAPI } from "../services/api";
import { useAuthStore } from "../stores/authStore";

vi.mock("../services/api", () => ({
  jobsAPI: {
    getById: vi.fn(),
    previewRun: vi.fn(),
    runNow: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
  },
  auditAPI: {
    jobHistory: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock("../stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderDetail(jobId = "job-http") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard/jobs/${jobId}`]}>
        <Routes>
          <Route path="/dashboard/jobs/:jobId" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderDetailWithMountedJobSwitch(jobId = "job-a") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard/jobs/${jobId}`]}>
        <Link to="/dashboard/jobs/job-b">Switch mounted job</Link>
        <Routes>
          <Route path="/dashboard/jobs/:jobId" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function shellJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: "job-shell",
    name: "Restart API",
    type: "shell",
    schedule: "manual",
    payload: { command: "systemctl restart api" },
    targetAgentId: { _id: "agent-1", name: "demo-web", status: "online", systemInfo: { hostname: "demo-web-01" } },
    enabled: false,
    retryLimit: 0,
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    userId: { username: "yash", email: "yash@example.com" },
    orgId: "org-1",
    ...overrides,
  };
}

function serverPreview(overrides: Record<string, unknown> = {}) {
  return {
    previewId: "preview-123",
    previewVersion: 1,
    previewHash: "sha256:bound-preview",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preview: {
      jobId: "job-http",
      jobName: "Restart API (server)",
      targetAgentId: "agent-server",
      targetLabel: "server-prod-01",
      command: "sudo systemctl restart api",
      actionVersion: "release-42",
      timeoutMs: 30000,
      maxOutputBytes: 4096,
      requiredReleaseId: "rel-2026.09.27",
      notifications: { onSuccess: true, onFailure: true, recipients: ["ops@example.test"] },
    },
    ...overrides,
  };
}

describe("JobDetailPage pilot execution policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    useAuthStore.setState({
      user: { _id: "user-1", username: "yash", email: "yash@example.com", role: "operator", orgId: "org-1" },
      isAuthenticated: true,
      isBootstrapping: false,
    });
    vi.mocked(jobsAPI.previewRun).mockResolvedValue({ data: serverPreview() } as never);
    vi.mocked(jobsAPI.runNow).mockResolvedValue({ data: { runId: "run-1", status: "PENDING" } } as never);
    vi.mocked(jobsAPI.listRuns).mockResolvedValue({ data: { runs: [], hasMore: false } } as never);
    vi.mocked(auditAPI.jobHistory).mockResolvedValue({ data: [] } as never);
  });

  it("keeps historical HTTP details visible without a launch control", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({
      data: {
        _id: "job-http",
        name: "Legacy webhook",
        type: "http",
        schedule: "0 * * * *",
        payload: { url: "https://example.test/hook", method: "POST" },
        enabled: true,
        retryLimit: 3,
        status: "active",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        userId: { username: "yash", email: "yash@example.com" },
        orgId: "org-1",
      },
    } as never);

    renderDetail();

    expect(await screen.findByText("Legacy webhook")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("pilot profile blocks HTTP execution");
    expect(screen.getByText("https://example.test/hook")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review & run" })).not.toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("guides a viewer without treating the saved target or guide as launch clearance", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    useAuthStore.setState({
      user: { _id: "viewer-1", username: "viewer", email: "viewer@example.com", role: "viewer", orgId: "org-1" },
    });

    renderDetail();

    const guide = await screen.findByRole("region", { name: "Before you run" });
    expect(within(guide).getByText(/role cannot request or approve a launch/i)).toBeInTheDocument();
    expect(within(guide).getByText(/selection alone does not prove the agent is connected/i)).toBeInTheDocument();
    expect(within(guide).getByText(/not requested.*nothing is submitted by this guide/i)).toBeInTheDocument();
    expect(jobsAPI.previewRun).not.toHaveBeenCalled();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("reviews immutable server preview values and submits only its exact identities", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);

    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    const confirmation = screen.getByRole("dialog", { name: "Review server-bound launch" });
    expect(confirmation).toBeInTheDocument();
    expect(within(confirmation).getByText(/server-prod-01/)).toBeInTheDocument();
    expect(within(confirmation).getByText("sudo systemctl restart api")).toBeInTheDocument();
    expect(within(confirmation).getByText("rel-2026.09.27")).toBeInTheDocument();
    expect(within(confirmation).getByText(/ops@example\.test/)).toBeInTheDocument();
    expect(within(confirmation).queryByText("systemctl restart api")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Before you run" })).getByText(/loaded for review.*before explicitly approving/i)).toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledWith(
      "job-http",
      { previewId: "preview-123", previewHash: "sha256:bound-preview" },
      expect.any(String),
    ));
    expect(await screen.findByText("Run run-1: PENDING")).toBeInTheDocument();
  });

  it("keeps the accepted original run ID visible when queue confirmation is unconfirmed", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockResolvedValue({ data: { runId: "original-run-1", status: "ACCEPTED", queueStateConfirmed: false } } as never);

    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(screen.getByRole("button", { name: "Approve server preview" }));

    expect(await screen.findByText(/Run original-run-1: accepted; queue state is unconfirmed/i)).toBeInTheDocument();
    expect(sessionStorage.getItem("axon.manual-run.pending.v1:org-1:user-1:job-http")).toBeNull();
  });

  it("keeps keyboard focus in launch review and restores it when cancelled without dispatching", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);

    renderDetail();

    const launch = await screen.findByRole("button", { name: "Review & run" });
    await user.click(launch);
    await screen.findByText("sudo systemctl restart api");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Approve server preview" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Approve server preview" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launch).toHaveFocus();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("restores focus after a dispatch completes, not while the launch control is disabled", async () => {
    const user = userEvent.setup();
    let completeRun: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockImplementationOnce(() => new Promise((resolve) => { completeRun = resolve; }) as never);

    renderDetail();

    const launch = await screen.findByRole("button", { name: "Review & run" });
    await user.click(launch);
    await user.click(screen.getByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(launch).toBeDisabled());
    expect(launch).not.toHaveFocus();

    completeRun({ data: { runId: "run-1", status: "PENDING" } });
    await waitFor(() => expect(launch).toHaveFocus());
  });

  it("reports permission denial without exposing a launch control", async () => {
    vi.mocked(jobsAPI.getById).mockRejectedValue({ response: { status: 403 } });

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to view this job");
    expect(screen.queryByRole("button", { name: "Review & run" })).not.toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("does not use a missing saved target as a launch value", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob({ targetAgentId: null }) } as never);

    renderDetail();

    const guide = await screen.findByRole("region", { name: "Before you run" });
    expect(within(guide).getByText(/no target is saved.*exact target/i)).toBeInTheDocument();
    expect(jobsAPI.previewRun).not.toHaveBeenCalled();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    expect(await screen.findByText("server-prod-01", { exact: false })).toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("retains an unknown acceptance packet and retries the same approval after refresh", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockRejectedValueOnce({
      response: { status: 503, data: { code: "LAUNCH_ACCEPTANCE_UNKNOWN" } },
    } as never);
    const first = renderDetail();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await screen.findByText(/acceptance is unknown/i);
    const firstCall = vi.mocked(jobsAPI.runNow).mock.calls[0];
    expect(firstCall).toEqual([
      "job-http",
      { previewId: "preview-123", previewHash: "sha256:bound-preview" },
      expect.any(String),
    ]);
    first.unmount();

    renderDetail();
    const check = await screen.findByRole("button", { name: "Check pending approval" });
    const guide = screen.getByRole("region", { name: "Before you run" });
    expect(within(guide).getByText(/approval is unresolved.*same identity/i)).toBeInTheDocument();
    await user.click(check);
    expect(await screen.findByText(/identical approval request/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check same approval" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledTimes(2));
    expect(vi.mocked(jobsAPI.runNow).mock.calls[1]).toEqual(firstCall);
    expect(jobsAPI.previewRun).toHaveBeenCalledTimes(1);
  });

  it("persists an approval identity before an in-flight dispatch can be interrupted by refresh", async () => {
    const user = userEvent.setup();
    let resolveDispatch: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockImplementationOnce(() => new Promise((resolve) => { resolveDispatch = resolve; }) as never);

    const first = renderDetail();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledTimes(1));

    const saved = sessionStorage.getItem("axon.manual-run.pending.v1:org-1:user-1:job-http");
    expect(saved).toEqual(expect.stringContaining("preview-123"));
    expect(saved).toEqual(expect.stringContaining(vi.mocked(jobsAPI.runNow).mock.calls[0][2]));

    first.unmount();
    renderDetail();
    expect(await screen.findByRole("button", { name: "Check pending approval" })).toBeInTheDocument();
    await act(async () => { resolveDispatch({ data: { runId: "late-run", status: "PENDING" } }); });
    expect(sessionStorage.getItem("axon.manual-run.pending.v1:org-1:user-1:job-http")).toEqual(saved);
  });

  it("keeps unresolved approvals separate for two jobs in the same account", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockRejectedValue({ response: { status: 503, data: { code: "LAUNCH_ACCEPTANCE_UNKNOWN" } } } as never);

    const first = renderDetail("job-a");
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await screen.findByText(/acceptance is unknown/i);
    first.unmount();

    const second = renderDetail("job-b");
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await screen.findByText(/acceptance is unknown/i);
    second.unmount();

    renderDetail("job-a");
    expect(await screen.findByRole("button", { name: "Check pending approval" })).toBeInTheDocument();
    expect(sessionStorage.getItem("axon.manual-run.pending.v1:org-1:user-1:job-b")).toEqual(expect.stringContaining("preview-123"));
  });

  it("does not show a late preview after the active account changes", async () => {
    const user = userEvent.setup();
    let resolvePreview: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.previewRun).mockImplementationOnce(() => new Promise((resolve) => { resolvePreview = resolve; }) as never);

    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    expect(await screen.findByText("Loading the server preview…")).toBeInTheDocument();
    act(() => {
      useAuthStore.setState({
        user: { _id: "user-2", username: "other", email: "other@example.com", role: "operator", orgId: "org-2" },
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await act(async () => { resolvePreview({ data: serverPreview() }); });
    expect(screen.queryByText("sudo systemctl restart api")).not.toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("does not submit when the browser cannot preserve the exact approval identity", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    const storageFailure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });

    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    expect(await screen.findByText(/could not preserve this approval identity/i)).toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
    storageFailure.mockRestore();
  });

  it("does not restore an unresolved packet for another tenant or account", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockRejectedValueOnce(new Error("offline") as never);
    const first = renderDetail();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await screen.findByText(/acceptance is unknown/i);
    first.unmount();
    useAuthStore.setState({
      user: { _id: "user-2", username: "other", email: "other@example.com", role: "operator", orgId: "org-2" },
    });

    renderDetail();
    expect(await screen.findByRole("button", { name: "Review & run" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check pending approval" })).not.toBeInTheDocument();
  });

  it.each([
    ["stale", { response: { status: 409, data: { code: "PREVIEW_STALE" } } }, /stale/i],
    ["expired", { response: { status: 410, data: { code: "PREVIEW_EXPIRED" } } }, /expired/i],
    ["permission", { response: { status: 403 } }, /permission/i],
  ])("disables approval for a %s server preview state", async (_state, error, message) => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.previewRun).mockRejectedValueOnce(error as never);
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    const guide = screen.getByRole("region", { name: "Before you run" });
    expect(within(guide).getByText(/no approval is available|request a new server preview/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve server preview" })).not.toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("tells the operator not to replay an UNKNOWN outcome", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(auditAPI.jobHistory).mockResolvedValue({
      data: [{ _id: "audit-1", status: "UNKNOWN", outcome: "unknown", startedAt: "2026-09-16T10:00:00.000Z", targetAgentId: "agent-1" }],
    } as never);

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("Do not run it again");
    expect(within(screen.getByRole("region", { name: "Before you run" })).getByText(/reconcile the target and saved run evidence/i)).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("marks execution evidence as unavailable instead of treating a missing refresh as a result", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(auditAPI.jobHistory).mockRejectedValue(new Error("offline"));

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("execution-history service is unavailable");
    expect(screen.getByText("Execution evidence could not be refreshed.")).toBeInTheDocument();
  });

  // ── Blocker 1: StrictMode mount/cleanup/remount must leave mountedRef true ──
  it("completes preview and launch successfully when rendered under React StrictMode", async () => {
    const { StrictMode } = await import("react");
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/dashboard/jobs/job-http"]}>
            <Routes>
              <Route path="/dashboard/jobs/:jobId" element={<JobDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );

    // Preview load must succeed (mountedRef must be true after StrictMode remount)
    const launch = await screen.findByRole("button", { name: "Review & run" });
    await user.click(launch);
    expect(await screen.findByText("sudo systemctl restart api")).toBeInTheDocument();

    // Launch submission must succeed (runNow continuation must not be discarded)
    await user.click(screen.getByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledWith(
      "job-http",
      { previewId: "preview-123", previewHash: "sha256:bound-preview" },
      expect.any(String),
    ));
    expect(await screen.findByText("Run run-1: PENDING")).toBeInTheDocument();
    // Unmount cleanup must set mountedRef false without crashing
    queryClient.clear();
  });

  // ── Blocker 2a: storage read failure → fail-closed, no launch submitted ──
  it("fails closed and blocks launch when sessionStorage.getItem throws", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    const readFailure = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("storage read unavailable");
    });

    renderDetail();
    // Wait for the component to fully render the launch button
    const launch = await screen.findByRole("button", { name: "Review & run" });
    // The launch button must be disabled because hydration failed
    await waitFor(() => expect(launch).toBeDisabled());
    // Error message must be displayed
    expect(screen.getByText(/could not safely recover approval state/i)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Before you run" })).getByText(/approval state is unverified/i)).toBeInTheDocument();
    // Clicking a disabled button must not open a dialog
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
    readFailure.mockRestore();
  });

  // ── Blocker 2b: unreadable storage is an uncertain approval, not cleanup input ──
  it("does not delete an unreadable persisted approval", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    const errors: unknown[] = [];
    const origOnError = window.onerror;
    window.onerror = (...args) => { errors.push(args); return true; };
    const origUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = (e) => { errors.push(e.reason); };

    const readFailure = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("storage read unavailable");
    });
    const removeFailure = vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
      throw new Error("storage remove unavailable");
    });

    renderDetail();
    // Allow the deferred timer to complete
    await screen.findByRole("button", { name: "Review & run" });
    await waitFor(() => expect(screen.getByText(/could not safely recover approval state/i)).toBeInTheDocument());

    // Flush microtask queue to allow any async errors to surface
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(errors).toHaveLength(0);
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
    expect(removeFailure).not.toHaveBeenCalled();
    readFailure.mockRestore();
    removeFailure.mockRestore();
    window.onerror = origOnError;
    window.onunhandledrejection = origUnhandled;
  });

  // ── Blocker 3: late POST success must not clear a newer durable packet ──
  it("does not clear a newer durable pending packet when a delayed POST succeeds after unmount", async () => {
    const user = userEvent.setup();
    let resolveLatePost: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockImplementationOnce(
      () => new Promise((resolve) => { resolveLatePost = resolve; }) as never,
    );

    // First render: dispatch in-flight (not yet resolved)
    const first = renderDetail("job-a");
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledTimes(1));

    // Capture the durable packet written before POST
    const key = "axon.manual-run.pending.v1:org-1:user-1:job-a";
    const originalPacket = sessionStorage.getItem(key);
    expect(originalPacket).toEqual(expect.stringContaining("preview-123"));

    // Unmount (simulates refresh / navigation away)
    first.unmount();

    // Second render of same job (new instance, preserves durable packet)
    renderDetail("job-a");
    expect(await screen.findByRole("button", { name: "Check pending approval" })).toBeInTheDocument();

    // Now the delayed POST success arrives from the old unmounted instance
    await act(async () => { resolveLatePost({ data: { runId: "late-run", status: "PENDING" } }); });

    // Durable packet must NOT have been cleared by the late response
    expect(sessionStorage.getItem(key)).toEqual(originalPacket);
    // The new render must not show a success message from the old response
    expect(screen.queryByText("Run late-run: PENDING")).not.toBeInTheDocument();
    // runNow was NOT called again by the new render
    expect(jobsAPI.runNow).toHaveBeenCalledTimes(1);
  });

  // ── Blocker 3b: late POST error must not affect a different job/account context ──
  it("does not affect a different job context when a delayed POST error arrives after unmount", async () => {
    const user = userEvent.setup();
    let rejectLatePost: (reason: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectLatePost = reject; }) as never,
    );

    // Render job-a, start an in-flight POST
    const first = renderDetail("job-a");
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledTimes(1));
    first.unmount();

    // Switch to job-b; it has no pending approval
    renderDetail("job-b");
    await screen.findByRole("button", { name: "Review & run" });

    // Delayed error from job-a POST arrives
    await act(async () => {
      rejectLatePost({ response: { status: 503, data: { code: "LAUNCH_ACCEPTANCE_UNKNOWN" } } });
    });

    // job-b context must be completely unaffected: no pending state, no feedback
    expect(screen.queryByRole("button", { name: "Check pending approval" })).not.toBeInTheDocument();
    expect(screen.queryByText(/acceptance is unknown/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review & run" })).toBeInTheDocument();
    expect(jobsAPI.runNow).toHaveBeenCalledTimes(1);
  });

  // ── Blocker 4: job/account transition must not allow confirmLaunch to use stale preview ──
  it("does not submit a POST after a job or account transition invalidates the preview context", async () => {
    const user = userEvent.setup();
    let resolvePreview: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    // First call returns a delayed preview (job-a context)
    vi.mocked(jobsAPI.previewRun).mockImplementationOnce(
      () => new Promise((resolve) => { resolvePreview = resolve; }) as never,
    );

    renderDetail("job-a");
    const launch = await screen.findByRole("button", { name: "Review & run" });
    await user.click(launch);
    expect(await screen.findByText("Loading the server preview…")).toBeInTheDocument();

    // Preview resolves, dialog ready
    await act(async () => { resolvePreview({ data: serverPreview() }); });
    await screen.findByText("sudo systemctl restart api");

    // Simulate account/job transition: change context before clicking Approve
    act(() => {
      useAuthStore.setState({
        user: { _id: "user-9", username: "other", email: "other@example.com", role: "operator", orgId: "org-9" },
      });
    });

    // The dialog is gone (context changed closes it) or the Approve button must not POST
    // If still rendered, clicking Approve after context change must not issue POST
    if (screen.queryByRole("button", { name: "Approve server preview" })) {
      await user.click(screen.getByRole("button", { name: "Approve server preview" }));
      // If the button was clickable, no POST must have been issued
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    }
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("does not clear the old approval or show success when a mounted job switch precedes a late POST success", async () => {
    const user = userEvent.setup();
    let resolveLatePost: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockImplementationOnce(
      () => new Promise((resolve) => { resolveLatePost = resolve; }) as never,
    );

    renderDetailWithMountedJobSwitch();
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledTimes(1));
    const oldKey = "axon.manual-run.pending.v1:org-1:user-1:job-a";
    const oldPacket = sessionStorage.getItem(oldKey);

    await user.click(screen.getByRole("link", { name: "Switch mounted job" }));
    await screen.findByRole("button", { name: "Review & run" });
    await act(async () => { resolveLatePost({ data: { runId: "late-job-a", status: "PENDING" } }); });

    expect(sessionStorage.getItem(oldKey)).toEqual(oldPacket);
    expect(screen.queryByText("Run late-job-a: PENDING")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check pending approval" })).not.toBeInTheDocument();
  });

  it("does not add pending state or feedback when a mounted account switch precedes a late POST error", async () => {
    const user = userEvent.setup();
    let rejectLatePost: (reason: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(jobsAPI.runNow).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectLatePost = reject; }) as never,
    );

    renderDetail("job-a");
    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    await user.click(await screen.findByRole("button", { name: "Approve server preview" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledTimes(1));

    act(() => {
      useAuthStore.setState({
        user: { _id: "user-9", username: "other", email: "other@example.com", role: "operator", orgId: "org-9" },
      });
    });
    await screen.findByRole("button", { name: "Review & run" });
    await act(async () => {
      rejectLatePost({ response: { status: 503, data: { code: "LAUNCH_ACCEPTANCE_UNKNOWN" } } });
    });

    expect(screen.queryByRole("button", { name: "Check pending approval" })).not.toBeInTheDocument();
    expect(screen.queryByText(/acceptance is unknown/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/late-job-a/i)).not.toBeInTheDocument();
  });

  it("fails closed after returning to a context whose approval hydration read fails", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    renderDetail("job-a");
    await screen.findByRole("button", { name: "Review & run" });

    act(() => {
      useAuthStore.setState({
        user: { _id: "user-9", username: "other", email: "other@example.com", role: "operator", orgId: "org-9" },
      });
    });
    await screen.findByRole("button", { name: "Review & run" });
    const readFailure = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("storage read unavailable");
    });
    act(() => {
      useAuthStore.setState({
        user: { _id: "user-1", username: "yash", email: "yash@example.com", role: "operator", orgId: "org-1" },
      });
    });

    const launch = await screen.findByRole("button", { name: "Review & run" });
    await waitFor(() => expect(launch).toBeDisabled());
    expect(await screen.findByText(/could not safely recover approval state/i)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Before you run" })).getByText(/approval state is unverified/i)).toBeInTheDocument();
    await user.click(launch);
    expect(jobsAPI.previewRun).not.toHaveBeenCalled();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
    readFailure.mockRestore();
  });

  it("keeps a stored approval identity intact when a transient read failure is followed by reload", async () => {
    const key = "axon.manual-run.pending.v1:org-1:user-1:job-a";
    const packet = JSON.stringify({ version: 1, jobId: "job-a", previewId: "saved-preview", previewHash: "sha256:saved", idempotencyKey: "saved-key" });
    sessionStorage.setItem(key, packet);
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    const readFailure = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("temporary storage failure");
    });

    const first = renderDetail("job-a");
    expect(await screen.findByText(/could not safely recover approval state/i)).toBeInTheDocument();
    expect(sessionStorage.getItem(key)).toEqual(packet);
    first.unmount();
    readFailure.mockRestore();

    renderDetail("job-a");
    expect(await screen.findByRole("button", { name: "Check pending approval" })).toBeInTheDocument();
    expect(sessionStorage.getItem(key)).toEqual(packet);
  });
});
