import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import JobFormSlide from "../components/dashboard/JobFormSlide";
import type { Job } from "../hooks/useDashboardData";

vi.mock("../services/api", () => ({
  jobsAPI: { create: vi.fn(), update: vi.fn() },
  agentsAPI: {
    getAll: vi.fn().mockResolvedValue({
      data: [{
        _id: "agent-1",
        name: "Primary Linux",
        status: "online",
        systemInfo: { hostname: "prod-01" },
      }],
    }),
  },
}));

vi.mock("../stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

function job(overrides: Partial<Job> = {}): Job {
  return {
    _id: "job-1",
    name: "Nightly backup",
    description: "Back up the primary database",
    type: "shell",
    schedule: "0 2 * * *",
    payload: { command: "pg_dump primary > backup.sql" },
    enabled: true,
    timeout: 45,
    retryLimit: 5,
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    userId: "user-1",
    orgId: "org-1",
    notifications: {
      onSuccess: true,
      onFailure: false,
      recipients: ["ops@example.com", "alerts@example.com"],
    },
    executionWindow: {
      enabled: true,
      startTime: "09:15",
      endTime: "17:45",
      activeDays: ["M", "W", "F"],
    },
    sink: {
      type: "mongo",
      uri: "mongodb://example/analytics",
      databaseName: "analytics",
      collectionName: "job_outputs",
      exportFormat: ["CSV", "JSON"],
    },
    ...overrides,
  };
}

function renderForm(props: { open: boolean; editing: Job | null }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = vi.fn();
  const view = (nextProps: { open: boolean; editing: Job | null }) => (
    <QueryClientProvider client={queryClient}>
      <JobFormSlide {...nextProps} onClose={onClose} />
    </QueryClientProvider>
  );
  const result = render(view(props));

  return {
    ...result,
    onClose,
    rerenderForm: (nextProps: { open: boolean; editing: Job | null }) =>
      result.rerender(view(nextProps)),
  };
}

describe("JobFormSlide", () => {
  it("initializes an edit draft with the job command and settings", () => {
    renderForm({ open: true, editing: job() });

    expect(screen.getByPlaceholderText("Nightly DB Backup")).toHaveValue("Nightly backup");
    expect(screen.getByPlaceholderText("Optional description")).toHaveValue("Back up the primary database");
    expect(screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz")).toHaveValue("pg_dump primary > backup.sql");
    expect(screen.getByDisplayValue("45")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("5")).not.toBeInTheDocument();
    expect(screen.getByText(/Shell jobs are manual-only/)).toBeInTheDocument();
    expect(screen.queryByText("On success")).not.toBeInTheDocument();
    expect(screen.queryByText("Execution window")).not.toBeInTheDocument();
  });

  it("resets the draft when switching to another job", async () => {
    const user = userEvent.setup();
    const first = job();
    const second = job({
      _id: "job-2",
      name: "Hourly cleanup",
      payload: { command: "find /tmp -delete" },
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    const { rerenderForm } = renderForm({ open: true, editing: first });
    const command = screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz");

    await user.clear(command);
    await user.type(command, "stale draft command");
    rerenderForm({ open: true, editing: second });

    expect(screen.getByPlaceholderText("Nightly DB Backup")).toHaveValue("Hourly cleanup");
    expect(screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz")).toHaveValue("find /tmp -delete");
  });

  it("discards an unsaved draft after closing and reopening", async () => {
    const user = userEvent.setup();
    const editing = job();
    const { rerenderForm } = renderForm({ open: true, editing });
    const command = screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz");

    await user.clear(command);
    await user.type(command, "stale draft command");
    rerenderForm({ open: false, editing });
    expect(screen.queryByPlaceholderText("pg_dump prod | gzip > /backup.gz")).not.toBeInTheDocument();

    rerenderForm({ open: true, editing });
    expect(screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz")).toHaveValue("pg_dump primary > backup.sql");
  });

  it("resets the draft when the same job receives a newer revision", async () => {
    const user = userEvent.setup();
    const original = job();
    const newerRevision = job({
      payload: { command: "pg_dump replica > backup.sql" },
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
    const { rerenderForm } = renderForm({ open: true, editing: original });
    const command = screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz");

    await user.clear(command);
    await user.type(command, "stale draft command");
    rerenderForm({ open: true, editing: newerRevision });

    expect(screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz")).toHaveValue("pg_dump replica > backup.sql");
  });

  it("requires an explicit stable target and sends shell jobs as manual-only", async () => {
    const user = userEvent.setup();
    renderForm({ open: true, editing: null });

    const target = await screen.findByRole("combobox", { name: "Target agent" });
    expect(target).toHaveValue("");
    expect(screen.getByRole("option", { name: /Primary Linux.*prod-01.*online.*agent-1/ })).toBeInTheDocument();
    expect(screen.queryByText("Schedule (cron)")).not.toBeInTheDocument();
    expect(screen.queryByText("Retry limit")).not.toBeInTheDocument();
    expect(screen.queryByText("Webhook URL")).not.toBeInTheDocument();
    expect(screen.queryByText("Data sink")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Nightly DB Backup"), "Restart service");
    await user.type(screen.getByPlaceholderText("pg_dump prod | gzip > /backup.gz"), "systemctl restart api");
    await user.selectOptions(target, "agent-1");
    expect(screen.getByText("Stable target ID: agent-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(vi.mocked((await import("../services/api")).jobsAPI.create)).toHaveBeenCalledWith(expect.objectContaining({
      targetAgentId: "agent-1",
      enabled: false,
      retryLimit: 0,
      webhookUrl: null,
    }));
  });
});
