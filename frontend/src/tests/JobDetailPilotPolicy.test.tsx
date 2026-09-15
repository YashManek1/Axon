import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import JobDetailPage from "../pages/dashboard/JobDetailPage";
import { jobsAPI } from "../services/api";

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

describe("JobDetailPage pilot execution policy", () => {
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
});
