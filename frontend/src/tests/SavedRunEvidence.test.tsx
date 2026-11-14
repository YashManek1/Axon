/* @vitest-environment jsdom */
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedRunEvidence from "../pages/dashboard/SavedRunEvidence";
import { jobsAPI } from "../services/api";

vi.mock("../services/api", () => ({ jobsAPI: { listRuns: vi.fn(), getRun: vi.fn() } }));

const run = { runId: "11111111-1111-4111-8111-111111111111", jobId: "job-a", targetAgentId: "agent-original", status: "UNKNOWN", requiresReview: true, createdAt: "2026-09-28T00:00:00.000Z", attempts: [{ attemptId: "attempt-1", targetExecutionId: "target-1", operationId: "operation-1", status: "ACKNOWLEDGED" }], transitions: [{ sequence: 1, from: "ACCEPTED", to: "ACKNOWLEDGED", at: "2026-09-28T00:00:00.000Z" }] };

describe("SavedRunEvidence", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(jobsAPI.listRuns).mockResolvedValue({ data: { runs: [run], hasMore: true } } as never); vi.mocked(jobsAPI.getRun).mockResolvedValue({ data: run } as never); });
  it("shows empty evidence after a StrictMode effect remount", async () => {
    vi.mocked(jobsAPI.listRuns).mockResolvedValue({ data: { runs: [], hasMore: false } } as never);
    render(<StrictMode><SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" /></StrictMode>);
    expect(await screen.findByText("No saved runs are available for this job.")).toBeInTheDocument();
  });
  it("renders uncertainty with the original target and performs only GET inspection", async () => {
    const user = userEvent.setup(); render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />);
    expect(await screen.findByText(/latest 10 saved runs; more exist/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect saved run" }));
    expect(await screen.findByText("agent-original")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Effects cannot be confirmed");
    expect(jobsAPI.getRun).toHaveBeenCalledWith("job-a", run.runId);
  });
  it("validates exact lookup and shows failed refresh without inventing an outcome", async () => {
    const user = userEvent.setup(); vi.mocked(jobsAPI.listRuns).mockRejectedValue({ response: { status: 503 } } as never);
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Do not infer an outcome");
    await user.type(screen.getByLabelText("Older or original run UUID"), "not-a-uuid"); await user.click(screen.getByRole("button", { name: "Inspect exact run" }));
    expect(screen.getByText(/exact canonical run UUID/i)).toBeInTheDocument(); expect(jobsAPI.getRun).not.toHaveBeenCalled();
  });
  it("clears protected evidence on permission denial and suppresses delayed old context responses", async () => {
    let resolveOld: (value: unknown) => void = () => undefined; vi.mocked(jobsAPI.listRuns).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }) as never).mockRejectedValueOnce({ response: { status: 403 } } as never);
    const view = render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); view.rerender(<SavedRunEvidence jobId="job-b" orgId="org-a" actorId="actor-a" />); resolveOld({ data: { runs: [run], hasMore: false } });
    expect(await screen.findByRole("alert")).toHaveTextContent("do not have permission"); expect(screen.queryByText(run.runId)).not.toBeInTheDocument();
  });
  it("refreshes evidence with GET only", async () => { const user = userEvent.setup(); render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await screen.findByText(run.runId, { exact: false }); await user.click(screen.getByRole("button", { name: "Refresh evidence" })); await waitFor(() => expect(jobsAPI.listRuns).toHaveBeenCalledTimes(2)); });
  it("shows accepted evidence as acceptance only and exposes the terminal summary", async () => {
    const user = userEvent.setup(); vi.mocked(jobsAPI.getRun).mockResolvedValue({ data: { ...run, status: "ACCEPTED", requiresReview: false, terminalSummary: { status: "FAILED", outcome: "failed", exitCode: 7, reasonCode: "EXIT" } } } as never);
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await user.click(await screen.findByRole("button", { name: "Inspect saved run" }));
    expect(await screen.findByText(/durable acceptance only/i)).toBeInTheDocument(); expect(screen.getByText(/exit code: 7/i)).toBeInTheDocument();
  });
  it("clears listed and selected evidence after a detail 401", async () => {
    const user = userEvent.setup(); vi.mocked(jobsAPI.getRun).mockRejectedValue({ response: { status: 401 } } as never);
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await user.click(await screen.findByRole("button", { name: "Inspect saved run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again"); expect(screen.queryByText(run.runId)).not.toBeInTheDocument();
  });
  it("keeps a late detail response cleared when a list request is denied", async () => {
    const user = userEvent.setup(); let resolveDetail: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.listRuns).mockResolvedValueOnce({ data: { runs: [run], hasMore: false } } as never).mockRejectedValueOnce({ response: { status: 403 } } as never);
    vi.mocked(jobsAPI.getRun).mockImplementationOnce(() => new Promise((resolve) => { resolveDetail = resolve; }) as never);
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await user.click(await screen.findByRole("button", { name: "Inspect saved run" })); await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not have permission"); resolveDetail({ data: run });
    await waitFor(() => expect(screen.queryByText("agent-original")).not.toBeInTheDocument());
  });
  it("keeps a late list response cleared when an exact-run request is denied", async () => {
    const user = userEvent.setup(); let resolveRefresh: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.listRuns).mockResolvedValueOnce({ data: { runs: [run], hasMore: false } } as never).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }) as never);
    vi.mocked(jobsAPI.getRun).mockRejectedValueOnce({ response: { status: 403 } } as never);
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await screen.findByText(run.runId, { exact: false }); await user.click(screen.getByRole("button", { name: "Refresh evidence" })); await user.click(screen.getByRole("button", { name: "Inspect saved run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not have permission"); resolveRefresh({ data: { runs: [run], hasMore: false } });
    await waitFor(() => expect(screen.queryByText(run.runId)).not.toBeInTheDocument());
  });
  it("does not render prior context evidence while the next context is loading", async () => {
    let resolveNext: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.listRuns).mockResolvedValueOnce({ data: { runs: [run], hasMore: false } } as never).mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }) as never);
    const view = render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await screen.findByText(run.runId, { exact: false });
    view.rerender(<SavedRunEvidence jobId="job-b" orgId="org-a" actorId="actor-a" />);
    expect(screen.queryByText(run.runId)).not.toBeInTheDocument(); expect(screen.queryByText("agent-original")).not.toBeInTheDocument();
    resolveNext({ data: { runs: [], hasMore: false } }); expect(await screen.findByText("No saved runs are available for this job.")).toBeInTheDocument();
  });
  it("accepts a UUIDv7 exact lookup", async () => {
    const user = userEvent.setup(); const versionSeven = "018f0f64-8e61-7abc-8def-0123456789ab";
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await screen.findByText(run.runId, { exact: false }); await user.type(screen.getByLabelText("Older or original run UUID"), versionSeven); await user.click(screen.getByRole("button", { name: "Inspect exact run" }));
    expect(jobsAPI.getRun).toHaveBeenCalledWith("job-a", versionSeven);
  });
  it("ignores an earlier overlapping refresh response", async () => {
    const user = userEvent.setup(); let resolveFirst: (value: unknown) => void = () => undefined; let resolveSecond: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.listRuns).mockResolvedValueOnce({ data: { runs: [run], hasMore: false } } as never).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }) as never).mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }) as never);
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); await screen.findByText(run.runId, { exact: false });
    await user.click(screen.getByRole("button", { name: "Refresh evidence" })); await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    resolveSecond({ data: { runs: [{ ...run, runId: "22222222-2222-4222-8222-222222222222" }], hasMore: false } }); expect(await screen.findByText(/22222222-2222/i)).toBeInTheDocument();
    resolveFirst({ data: { runs: [{ ...run, runId: "33333333-3333-4333-8333-333333333333" }], hasMore: false } }); await waitFor(() => expect(screen.queryByText(/33333333-3333/i)).not.toBeInTheDocument());
  });
  it("ignores an earlier overlapping exact-run response", async () => {
    const user = userEvent.setup(); let resolveFirst: (value: unknown) => void = () => undefined; let resolveSecond: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getRun).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }) as never).mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }) as never);
    render(<SavedRunEvidence jobId="job-a" orgId="org-a" actorId="actor-a" />); const inspect = await screen.findByRole("button", { name: "Inspect saved run" });
    await user.click(inspect); await user.click(inspect);
    resolveSecond({ data: { ...run, targetAgentId: "second-target" } }); expect(await screen.findByText("second-target")).toBeInTheDocument();
    resolveFirst({ data: { ...run, targetAgentId: "old-target" } }); await waitFor(() => expect(screen.queryByText("old-target")).not.toBeInTheDocument());
  });
});

describe("SavedRunEvidence handoff", () => {
  const handoffJobId = "507f1f77bcf86cd799439011";
  const handoffRun = { ...run, jobId: handoffJobId, targetAgentId: "507f1f77bcf86cd799439012", status: "ACKNOWLEDGED", runId: "11111111-1111-4111-8111-111111111111" };
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(jobsAPI.listRuns).mockResolvedValue({ data: { runs: [handoffRun], hasMore: false } } as never); vi.mocked(jobsAPI.getRun).mockResolvedValue({ data: handoffRun } as never); });
  it("requires a fresh prepare then a separately reauthorized copy", async () => {
    const user = userEvent.setup(); const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<SavedRunEvidence jobId={handoffJobId} orgId="org-a" actorId="actor-a" />);
    await user.click(await screen.findByRole("button", { name: "Inspect saved run" }));
    await user.click(await screen.findByRole("button", { name: "Prepare saved-run handoff" }));
    expect(await screen.findByTestId("saved-run-handoff-preview")).toHaveTextContent("Saved-run handoff - snapshot, not live");
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(jobsAPI.getRun).toHaveBeenCalledTimes(3);
  });
  it("replaces a changed fresh payload and requires a second review", async () => {
    const user = userEvent.setup(); const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(jobsAPI.getRun).mockResolvedValueOnce({ data: handoffRun } as never).mockResolvedValueOnce({ data: handoffRun } as never).mockResolvedValueOnce({ data: { ...handoffRun, status: "FAILED" } } as never);
    render(<SavedRunEvidence jobId={handoffJobId} orgId="org-a" actorId="actor-a" />); await user.click(await screen.findByRole("button", { name: "Inspect saved run" })); await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" })); await user.click(await screen.findByRole("button", { name: "Copy reviewed handoff" }));
    expect(await screen.findByRole("status")).toHaveTextContent("changed"); expect(writeText).not.toHaveBeenCalled();
  });
  it("reports clipboard rejection without claiming a copy", async () => {
    const user = userEvent.setup(); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<SavedRunEvidence jobId={handoffJobId} orgId="org-a" actorId="actor-a" />); await user.click(await screen.findByRole("button", { name: "Inspect saved run" })); await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" })); await user.click(await screen.findByRole("button", { name: "Copy reviewed handoff" }));
    expect(await screen.findByRole("status")).toHaveTextContent("could not be copied");
  });
  it("globally clears a prepared preview when its fresh handoff read is denied", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getRun).mockResolvedValueOnce({ data: handoffRun } as never).mockRejectedValueOnce({ response: { status: 403 } } as never);
    render(<SavedRunEvidence jobId={handoffJobId} orgId="org-a" actorId="actor-a" />);
    await user.click(await screen.findByRole("button", { name: "Inspect saved run" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not have permission");
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(screen.queryByText(handoffRun.runId)).not.toBeInTheDocument();
  });
  it("globally clears a prepared preview when the separately authorized copy read is denied", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getRun).mockResolvedValueOnce({ data: handoffRun } as never).mockResolvedValueOnce({ data: handoffRun } as never).mockRejectedValueOnce({ response: { status: 401 } } as never);
    render(<SavedRunEvidence jobId={handoffJobId} orgId="org-a" actorId="actor-a" />);
    await user.click(await screen.findByRole("button", { name: "Inspect saved run" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await user.click(await screen.findByRole("button", { name: "Copy reviewed handoff" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(screen.queryByText(handoffRun.runId)).not.toBeInTheDocument();
  });
});
