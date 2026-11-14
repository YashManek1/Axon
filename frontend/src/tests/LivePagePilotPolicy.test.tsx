import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LivePage from "../pages/dashboard/LivePage";
import { jobsAPI } from "../services/api";
import { useJobs } from "../hooks/useDashboardData";

vi.mock("../hooks/useDashboardData", () => ({
  useJobs: vi.fn(),
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

const mockedUseJobs = vi.mocked(useJobs);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard/live"]}>
      <LivePage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("LivePage pilot execution policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps historical HTTP logs selectable but blocks launch", async () => {
    mockedUseJobs.mockReturnValue({
      data: [{
        _id: "job-http",
        name: "Legacy HTTP job",
        type: "http",
        schedule: "0 * * * *",
        payload: { url: "https://example.test/hook" },
      }],
    } as never);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByRole("combobox"), "job-http");

    expect(screen.getByText("unsupported in pilot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review & run" })).toBeDisabled();
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard/live");
  });

  it("routes a supported job to JobDetail approval without direct launch", async () => {
    mockedUseJobs.mockReturnValue({
      data: [{
        _id: "job-shell",
        name: "Shell job",
        type: "shell",
        schedule: "0 * * * *",
        payload: { command: "echo ok" },
      }],
    } as never);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByRole("combobox"), "job-shell");
    await user.click(screen.getByRole("button", { name: "Review & run" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard/jobs/job-shell");
    expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });
});
