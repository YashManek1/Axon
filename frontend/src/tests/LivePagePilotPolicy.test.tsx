import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LivePage from "../pages/dashboard/LivePage";
import { jobsAPI } from "../services/api";

vi.mock("../hooks/useDashboardData", () => ({
  useJobs: () => ({
    data: [{
      _id: "job-http",
      name: "Legacy HTTP job",
      type: "http",
      schedule: "0 * * * *",
      payload: { url: "https://example.test/hook" },
    }],
  }),
}));

vi.mock("../hooks/useAgentSocket", () => ({
  useAgentSocket: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    recentLogs: [],
    loading: false,
  }),
}));

vi.mock("../services/api", () => ({ jobsAPI: { runNow: vi.fn() } }));
vi.mock("../stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("LivePage pilot execution policy", () => {
  it("keeps historical HTTP logs selectable but blocks launch", async () => {
    const user = userEvent.setup();
    render(<LivePage />);

    await user.selectOptions(screen.getByRole("combobox"), "job-http");

    expect(screen.getByText("unsupported in pilot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });
});
