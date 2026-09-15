import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import OverviewPage from "../pages/dashboard/OverviewPage";
import { useAgents, useJobs, useRecentAudit } from "../hooks/useDashboardData";

vi.mock("../hooks/useDashboardData", () => ({
  useAgents: vi.fn(),
  useJobs: vi.fn(),
  useRecentAudit: vi.fn(),
}));

vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

it("shows a future audit entry as just now until the next clock tick", () => {
  vi.mocked(useAgents).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(useJobs).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(useRecentAudit).mockReturnValue({
    data: [{
      _id: "audit-1",
      jobId: "job-1",
      command: "echo future",
      triggerType: "manual",
      agentId: null,
      status: "COMPLETED",
      startedAt: new Date(Date.now() + 20_000).toISOString(),
    }],
  } as never);

  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );

  expect(screen.getByText("0s ago")).toBeInTheDocument();
  expect(screen.queryByText(/-\d+s ago/)).not.toBeInTheDocument();
});
