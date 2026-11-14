import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout from "../components/layout/DashboardLayout";
import AgentsPage from "../pages/dashboard/AgentsPage";
import JobsPage from "../pages/dashboard/JobsPage";
import OverviewPage from "../pages/dashboard/OverviewPage";
import { useAgents, useJobs, useRecentAudit } from "../hooks/useDashboardData";
import { useAuthStore } from "../stores/authStore";

vi.mock("../hooks/useDashboardData", () => ({
  useAgents: vi.fn(),
  useJobs: vi.fn(),
  useRecentAudit: vi.fn(),
}));

vi.mock("../stores/authStore", () => ({ useAuthStore: vi.fn() }));
vi.mock("../stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "light", toggle: vi.fn() })),
}));
vi.mock("../services/api", () => ({
  agentsAPI: { register: vi.fn(), rotateKey: vi.fn(), decommission: vi.fn() },
  jobsAPI: { delete: vi.fn() },
  authAPI: { logout: vi.fn() },
}));
vi.mock("../stores/toastStore", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../stores/confirmStore", () => ({ useConfirmStore: vi.fn(() => vi.fn()) }));
vi.mock("../components/dashboard/JobFormSlide", () => ({ default: () => null }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const mockedUseAgents = vi.mocked(useAgents);
const mockedUseJobs = vi.mocked(useJobs);
const mockedUseRecentAudit = vi.mocked(useRecentAudit);
const mockedUseAuthStore = vi.mocked(useAuthStore);

const idleQuery = { data: [], isLoading: false, isError: false, error: null };

function renderPage(page: React.ReactNode, initialEntries = ["/"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={initialEntries}>{page}</MemoryRouter></QueryClientProvider>);
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function server(overrides: Record<string, unknown> = {}) {
  return {
    _id: "server-1", name: "nonprod-web-01", userId: "user-1", orgId: "org-1",
    status: "online", lastSeen: new Date().toISOString(), socketId: "socket-1",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides,
  };
}

function operation(overrides: Record<string, unknown> = {}) {
  return {
    _id: "operation-1", name: "Collect diagnostics", type: "shell", schedule: "",
    payload: { command: "uname -a" }, enabled: true, retryLimit: 0, status: "active",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    userId: "user-1", orgId: "org-1", ...overrides,
  };
}

describe("dashboard clarity states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuthStore.mockReturnValue({ user: { username: "viewer", role: "user" }, logout: vi.fn() } as never);
    mockedUseAgents.mockReturnValue(idleQuery as never);
    mockedUseJobs.mockReturnValue(idleQuery as never);
    mockedUseRecentAudit.mockReturnValue(idleQuery as never);
  });

  it("distinguishes overview loading from an empty workspace", () => {
    const loading = { data: [], isLoading: true, isError: false, error: null };
    mockedUseAgents.mockReturnValue(loading as never);
    mockedUseJobs.mockReturnValue(loading as never);
    mockedUseRecentAudit.mockReturnValue(loading as never);

    renderPage(<OverviewPage />);

    expect(screen.getByRole("status", { name: /loading recent execution records/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading server records/i })).toBeInTheDocument();
    expect(screen.queryByText("No server records are available")).not.toBeInTheDocument();
  });

  it("explains denied overview data without presenting it as empty", () => {
    mockedUseAgents.mockReturnValue({ ...idleQuery, isError: true, error: { response: { status: 403 } } } as never);

    renderPage(<OverviewPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("do not have permission to view server records");
    expect(screen.queryByText("No server records are available")).not.toBeInTheDocument();
  });

  it("marks failed queries without records as unavailable instead of loaded zeroes", () => {
    const failedQuery = { data: [], isLoading: false, isError: true, error: new Error("offline") };
    mockedUseAgents.mockReturnValue(failedQuery as never);
    mockedUseJobs.mockReturnValue(failedQuery as never);
    mockedUseRecentAudit.mockReturnValue(failedQuery as never);

    renderPage(<OverviewPage />);

    const stats = screen.getByLabelText("Workspace records with unavailable data");
    expect(within(stats).getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("server records unavailable")).toBeInTheDocument();
    expect(screen.getByText("operation records unavailable")).toBeInTheDocument();
    expect(screen.getByText("recent records unavailable")).toBeInTheDocument();
    expect(screen.queryByText("of 0 loaded server records")).not.toBeInTheDocument();
    expect(screen.queryByText("of 0 loaded operations")).not.toBeInTheDocument();
  });

  it("labels stale overview records as last available rather than current", () => {
    mockedUseAgents.mockReturnValue({ data: [server()], isLoading: false, isError: true, error: new Error("offline") } as never);

    renderPage(<OverviewPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Showing the last available records");
    expect(screen.getByText("nonprod-web-01")).toBeInTheDocument();
  });

  it("shows unavailable server telemetry plainly", () => {
    mockedUseAgents.mockReturnValue({ data: [server({ status: "busy", lastSeen: null, systemInfo: {} })], isLoading: false, isError: false, error: null } as never);

    renderPage(<AgentsPage />);

    expect(screen.getByText("busy")).toBeInTheDocument();
    expect(screen.getAllByText("Not reported").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a keyboard-operable operation detail link", async () => {
    mockedUseJobs.mockReturnValue({ data: [operation()], isLoading: false, isError: false, error: null } as never);
    const user = userEvent.setup();
    renderPage(<><JobsPage /><LocationProbe /></>);

    await user.click(screen.getByRole("link", { name: "Collect diagnostics" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard/jobs/operation-1");
  });

  it("presents the staging version example as static, unvalidated guidance", () => {
    renderPage(<JobsPage />);

    const guide = screen.getByRole("complementary", { name: "Check staging application version" });
    expect(guide).toHaveTextContent("Example — manual setup, not validated for your server");
    expect(guide).toHaveTextContent("This procedure is not installed");
    expect(guide).toHaveTextContent("responsible environment owner must permit the check");
    expect(guide).toHaveTextContent("confirm the exact Linux staging server");
    expect(guide).toHaveTextContent("cat /srv/example/VERSION");
    expect(guide).toHaveTextContent("UNKNOWN, stop and ask the responsible owner");
    expect(guide).toHaveTextContent("does not establish application health or deployment readiness");
    expect(guide).toHaveTextContent("Do not blindly repeat the command");
    expect(within(guide).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps role-aware Servers and Operations navigation", async () => {
    mockedUseAuthStore.mockReturnValue({ user: { username: "admin", role: "admin" }, logout: vi.fn() } as never);
    const user = userEvent.setup();
    renderPage(
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard/overview" element={<LocationProbe />} />
          <Route path="/dashboard/*" element={<LocationProbe />} />
        </Route>
      </Routes>,
      ["/dashboard/overview"],
    );

    expect(screen.getByRole("button", { name: "Servers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Operations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analytics" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Operations" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard/jobs");
  });
});
