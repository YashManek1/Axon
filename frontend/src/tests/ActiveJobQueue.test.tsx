import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobsPage from "../pages/dashboard/JobsPage";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useJobs } from "../hooks/useDashboardData";
import { jobsAPI } from "../services/api";
import { useConfirmStore } from "../stores/confirmStore";

vi.mock("../hooks/useDashboardData", () => ({
  useJobs: vi.fn(),
}));

vi.mock("../services/api", () => ({
  jobsAPI: {
    toggle: vi.fn(),
    delete: vi.fn(),
    runNow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../components/dashboard/JobFormSlide", () => ({
  default: () => null,
}));

const mockedUseJobs = vi.mocked(useJobs);
const mockedJobsAPI = vi.mocked(jobsAPI);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <JobsPage />
        <ConfirmDialog />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function job(index: number) {
  return {
    _id: `job-${index}`,
    name: `Job ${index}`,
    type: "shell" as const,
    schedule: "* * * * *",
    payload: { command: "echo ok" },
    enabled: true,
    retryLimit: 0,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: { username: "yash", email: "yash@example.com" },
    orgId: "org-1",
  };
}

describe("ActiveJobQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfirmStore.getState().close();
  });

  it("renders empty state when jobs array is empty", () => {
    mockedUseJobs.mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText("No jobs found")).toBeInTheDocument();
  });

  it("renders job rows when jobs are provided", () => {
    mockedUseJobs.mockReturnValue({
      data: [job(1), job(2)],
      isLoading: false,
    } as never);
    renderPage();
    expect(screen.getByText("Job 1")).toBeInTheDocument();
    expect(screen.getByText("Job 2")).toBeInTheDocument();
  });

  it("Run Now button becomes disabled while loading", async () => {
    mockedUseJobs.mockReturnValue({
      data: [job(1)],
      isLoading: false,
    } as never);
    let resolveRunNow: () => void = () => {};
    mockedJobsAPI.runNow.mockReturnValue(
      new Promise((resolve) => {
        resolveRunNow = () => resolve({ data: {} });
      }) as never,
    );

    renderPage();
    const button = screen.getByRole("button", { name: "Run now" });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    resolveRunNow();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("shows the accepted shell run ID and status returned by the API", async () => {
    mockedUseJobs.mockReturnValue({ data: [job(1)], isLoading: false, isError: false } as never);
    mockedJobsAPI.runNow.mockResolvedValue({ data: { runId: "run-42", status: "QUEUED" } } as never);

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Run now" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Run run-42: QUEUED");
  });

  it("shows the API rejection rather than claiming a launch", async () => {
    mockedUseJobs.mockReturnValue({ data: [job(1)], isLoading: false, isError: false } as never);
    mockedJobsAPI.runNow.mockRejectedValue({
      response: { data: { code: "TARGET_AGENT_OFFLINE", message: "The selected agent is offline; no substitute target was used" } },
    });

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Run now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("TARGET_AGENT_OFFLINE: The selected agent is offline; no substitute target was used");
  });

  it("clicking Delete opens the confirm dialog", async () => {
    mockedUseJobs.mockReturnValue({
      data: [job(1)],
      isLoading: false,
    } as never);

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Delete Job")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Are you sure you want to delete this job? This action cannot be undone.",
      ),
    ).toBeInTheDocument();
  });

  it("status filter buttons are rendered", () => {
    mockedUseJobs.mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paused" })).toBeInTheDocument();
  });
});
