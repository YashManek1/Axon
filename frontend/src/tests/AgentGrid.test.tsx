import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPage from "../pages/dashboard/AgentsPage";
import { useAgents } from "../hooks/useDashboardData";
import { useAuthStore } from "../stores/authStore";

vi.mock("../hooks/useDashboardData", () => ({
  useAgents: vi.fn(),
}));

vi.mock("../stores/authStore", () => ({
  useAuthStore: vi.fn(() => ({ user: { role: "user" } })),
}));

vi.mock("../services/api", () => ({
  agentsAPI: {
    register: vi.fn(),
    rotateKey: vi.fn(),
    decommission: vi.fn(),
  },
}));

vi.mock("../stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockedUseAgents = vi.mocked(useAgents);
const mockedUseAuthStore = vi.mocked(useAuthStore);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    _id: "agent-1",
    name: "rust-agent-01",
    userId: "user-1",
    orgId: "org-1",
    status: "online" as const,
    lastSeen: new Date().toISOString(),
    socketId: "socket-1",
    systemInfo: {
      os: "linux",
      arch: "x64",
      hostname: "host-1",
      cpuLoad: 42,
      ramTotal: 8,
      ramUsed: 4,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AgentGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuthStore.mockReturnValue({ user: { role: "user" } } as never);
  });

  it("renders empty state when agents array is empty", () => {
    mockedUseAgents.mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(screen.getByText("No servers registered")).toBeInTheDocument();
  });

  it("renders agent cards when agents are provided", () => {
    mockedUseAgents.mockReturnValue({
      data: [agent()],
      isLoading: false,
    } as never);
    renderPage();
    expect(screen.getByText("rust-agent-01")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
  });

  it("shows offline warning banner when an agent is offline", () => {
    mockedUseAgents.mockReturnValue({
      data: [agent({ status: "offline" as const })],
      isLoading: false,
    } as never);
    renderPage();
    expect(screen.getAllByText(/connection unavailable/i).length).toBeGreaterThan(0);
  });

  it("Register server button is present for an administrator", () => {
    mockedUseAuthStore.mockReturnValue({ user: { role: "admin" } } as never);
    mockedUseAgents.mockReturnValue({ data: [], isLoading: false } as never);
    renderPage();
    expect(
      screen.getAllByRole("button", { name: /register a server/i }).length,
    ).toBeGreaterThan(0);
  });
});
