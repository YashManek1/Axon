import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "../pages/dashboard/JobDetailPage";
import { auditAPI, jobsAPI } from "../services/api";

vi.mock("../services/api", () => ({
  jobsAPI: {
    getById: vi.fn(),
    runNow: vi.fn(),
  },
  auditAPI: {
    jobHistory: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock("../stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard/jobs/job-http"]}>
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

describe("JobDetailPage pilot execution policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(jobsAPI.runNow).mockResolvedValue({ data: { runId: "run-1", status: "PENDING" } } as never);
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
    expect(screen.queryByRole("button", { name: "Run now" })).not.toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("requires a review of the saved command and exact target before dispatch", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);

    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    const confirmation = screen.getByRole("dialog", { name: "Confirm exact target and command" });
    expect(confirmation).toBeInTheDocument();
    expect(within(confirmation).getByText("demo-web · demo-web-01 · agent-1")).toBeInTheDocument();
    expect(within(confirmation).getByText("systemctl restart api")).toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Dispatch to this target" }));
    await waitFor(() => expect(jobsAPI.runNow).toHaveBeenCalledWith("job-http"));
    expect(await screen.findByText("Run run-1: PENDING")).toBeInTheDocument();
  });

  it("blocks a shell job with no saved exact target before any dispatch", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob({ targetAgentId: null }) } as never);

    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Review & run" }));
    expect(screen.getByText(/has no exact target saved/)).toBeInTheDocument();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("tells the operator not to replay an UNKNOWN outcome", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(auditAPI.jobHistory).mockResolvedValue({
      data: [{ _id: "audit-1", status: "UNKNOWN", outcome: "unknown", startedAt: "2026-09-16T10:00:00.000Z", targetAgentId: "agent-1" }],
    } as never);

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("Do not run it again");
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("marks execution evidence as unavailable instead of treating a missing refresh as a result", async () => {
    vi.mocked(jobsAPI.getById).mockResolvedValue({ data: shellJob() } as never);
    vi.mocked(auditAPI.jobHistory).mockRejectedValue(new Error("offline"));

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("execution-history service is unavailable");
    expect(screen.getByText("Execution evidence could not be refreshed.")).toBeInTheDocument();
  });
});
