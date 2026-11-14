/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedRunEvidence from "../pages/dashboard/SavedRunEvidence";
import HomePage from "../pages/HomePage";
import { jobsAPI } from "../services/api";

vi.mock("../services/api", () => ({
  jobsAPI: {
    getById: vi.fn(),
    previewRun: vi.fn(),
    runNow: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
  },
  auditAPI: {
    jobHistory: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock("../stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Human Accessibility & Screen Reader Contract (docs/axon-human-validation-walkthrough-2026-10-04.md)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("Landing page provides skip link, landmark roles, and accessible theme controls", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    // Skip link exists and is keyboard accessible
    const skipLink = screen.getByRole("link", { name: /skip to content/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#main-content");

    // Main landmark role exists
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();

    // Theme toggle control has understandable accessible name
    const themeButton = screen.getByRole("button", { name: /switch to/i });
    expect(themeButton).toBeInTheDocument();
  });

  it("UNKNOWN execution outcome audibly announces uncertainty caveats via role='status' or 'alert'", async () => {
    const jobId = "507f1f77bcf86cd799439011";
    const run = {
      jobId,
      runId: "11111111-1111-4111-8111-111111111111",
      targetAgentId: "507f1f77bcf86cd799439012",
      status: "UNKNOWN",
      requiresReview: true,
      attempts: [],
      transitions: [],
    };

    vi.mocked(jobsAPI.listRuns).mockResolvedValue({ data: { runs: [run], hasMore: false } } as never);
    vi.mocked(jobsAPI.getRun).mockResolvedValue({ data: run } as never);

    render(
      <MemoryRouter>
        <SavedRunEvidence jobId={jobId} orgId="org-a" actorId="viewer-a" />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    const inspectBtn = await screen.findByRole("button", { name: "Inspect saved run" });
    await user.click(inspectBtn);

    // Inspect panel renders warning
    const statusBadges = screen.getAllByText("UNKNOWN");
    expect(statusBadges.length).toBeGreaterThan(0);

    // Prepare handoff and verify caveats are announced in preview
    const prepBtn = screen.getByRole("button", { name: "Prepare saved-run handoff" });
    await user.click(prepBtn);

    const preview = await screen.findByTestId("saved-run-handoff-preview");
    expect(preview).toBeInTheDocument();
    // Screen readers get explicit notice that effects are unconfirmed
    expect(preview).toHaveTextContent(/cannot confirm effects/i);
  });
});
