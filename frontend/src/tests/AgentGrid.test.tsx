import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentGrid from "../components/dashboard/AgentGrid";
import { useAgents } from "../hooks/useDashboardData";

vi.mock("../hooks/useDashboardData", () => ({
  useAgents: vi.fn(),
}));

const mockedUseAgents = vi.mocked(useAgents);

function agent(overrides = {}) {
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
      hostname: "host-1",
      cpuLoad: 42,
      ramTotal: 1024,
      ramUsed: 512,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AgentGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when agents array is empty", () => {
    mockedUseAgents.mockReturnValue({ data: [], isLoading: false } as never);

    render(<AgentGrid />);

    expect(
      screen.getByText(
        "No agents registered. Download and install the Axon agent to connect your first machine.",
      ),
    ).toBeInTheDocument();
  });

  it("renders agent cards when agents are provided", () => {
    mockedUseAgents.mockReturnValue({
      data: [agent()],
      isLoading: false,
    } as never);

    render(<AgentGrid />);

    expect(screen.getByText("rust-agent-01")).toBeInTheDocument();
    expect(screen.getByText(/Status: Online/)).toBeInTheDocument();
  });

  it("agent with lastSeen over 60 seconds ago shows Stale badge", () => {
    mockedUseAgents.mockReturnValue({
      data: [
        agent({
          lastSeen: new Date(Date.now() - 61000).toISOString(),
        }),
      ],
      isLoading: false,
    } as never);

    render(<AgentGrid />);

    expect(screen.getByText(/Status: Stale/)).toBeInTheDocument();
  });

  it("Deploy Agent button is present", () => {
    mockedUseAgents.mockReturnValue({ data: [], isLoading: false } as never);

    render(<AgentGrid />);

    expect(
      screen.getByRole("button", { name: /Deploy Agent/i }),
    ).toBeInTheDocument();
  });
});
