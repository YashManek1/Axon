/* @vitest-environment jsdom */
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReconciliationPanel from "./ReconciliationPanel";
import { jobsAPI } from "../../services/api";

vi.mock("../../services/api", () => ({ jobsAPI: { getReconciliation: vi.fn(), recordReconciliationResolution: vi.fn(), previewRun: vi.fn(), runNow: vi.fn() } }));

const runId = "11111111-1111-4111-8111-111111111111";
const proofId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const record = (overrides: Record<string, unknown> = {}) => ({ runId, attemptId: "attempt-a", targetAgentId: "agent-original", status: "UNKNOWN", transitionSequence: 7, eligible: true, blockedReason: null, proof: { version: 1, proofId, recordedAt: "2026-10-09T00:00:00.000Z", terminalTransitionSequence: 7 }, resolution: null, originalHoldObservation: "PRESENT", ...overrides });
function renderPanel(props: Partial<{ jobId: string; orgId: string; actorId: string }> = {}) { return render(<ReconciliationPanel jobId={props.jobId ?? "job-a"} orgId={props.orgId ?? "org-a"} actorId={props.actorId ?? "actor-a"} />); }

describe("ReconciliationPanel", () => {
  beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); vi.mocked(jobsAPI.getReconciliation).mockResolvedValue({ data: record() } as never); vi.mocked(jobsAPI.recordReconciliationResolution).mockImplementation((_jobId, _runId, _body, idempotencyKey) => Promise.resolve({ data: { resolutionId: idempotencyKey, runId, status: "UNKNOWN", releaseIntentRecorded: true, originalHoldObservation: "ABSENT", targetAvailability: "NOT_ESTABLISHED" } }) as never); });

  async function inspect(user: ReturnType<typeof userEvent.setup>) { await user.type(screen.getByLabelText("Run ID"), runId); await user.click(screen.getByRole("button", { name: "Inspect reconciliation" })); await screen.findByText("agent-original"); }
  async function acknowledgeIntent(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("checkbox", { name: /I understand this records an operator intent only/i })); }

  it("loads exact protected state and records only the bounded release intent", async () => {
    const user = userEvent.setup(); renderPanel(); await inspect(user);
    expect(jobsAPI.getReconciliation).toHaveBeenCalledWith("job-a", runId);
    await user.type(screen.getByLabelText("Why record this release intent?"), "Verified the bounded proof.");
    expect(screen.getByRole("button", { name: "Record release intent" })).toBeDisabled();
    await acknowledgeIntent(user);
    await user.click(screen.getByRole("button", { name: "Record release intent" }));
    await screen.findByText(/Release intent recorded; the original hold was absent/i);
    expect(jobsAPI.recordReconciliationResolution).toHaveBeenCalledWith("job-a", runId, { proofId, expectedTransitionSequence: 7, reason: "Verified the bounded proof." }, expect.any(String));
    expect(jobsAPI.getReconciliation).toHaveBeenCalledTimes(2);
    expect(jobsAPI.previewRun).not.toHaveBeenCalled(); expect(jobsAPI.runNow).not.toHaveBeenCalled();
  });

  it("keeps exact request identity and body after an ambiguous response", async () => {
    const user = userEvent.setup(); vi.mocked(jobsAPI.recordReconciliationResolution).mockRejectedValueOnce({ response: { status: 503 } } as never).mockResolvedValueOnce({ data: { resolutionId: "id", runId, status: "UNKNOWN", releaseIntentRecorded: true, originalHoldObservation: "ABSENT", targetAvailability: "NOT_ESTABLISHED" } } as never);
    renderPanel(); await inspect(user); await user.type(screen.getByLabelText("Why record this release intent?"), "Reason"); await acknowledgeIntent(user); await user.click(screen.getByRole("button", { name: "Record release intent" })); await screen.findByRole("alert");
    const first = vi.mocked(jobsAPI.recordReconciliationResolution).mock.calls[0];
    await user.click(screen.getByRole("button", { name: "Check same release intent" })); await waitFor(() => expect(jobsAPI.recordReconciliationResolution).toHaveBeenCalledTimes(2));
    expect(vi.mocked(jobsAPI.recordReconciliationResolution).mock.calls[1]).toEqual(first);
  });

  it("freezes and displays the original immutable reason for a recovered request", async () => {
    const user = userEvent.setup(); const idempotencyKey = "22222222-2222-4222-8222-222222222222"; const originalReason = "Original immutable reason";
    sessionStorage.setItem(`axon.reconciliation.pending.v1:org-a:actor-a:job-a:${runId}`, JSON.stringify({ version: 1, runId, body: { proofId, expectedTransitionSequence: 7, reason: originalReason }, idempotencyKey }));
    renderPanel(); await inspect(user);
    const reasonField = screen.getByLabelText("Why record this release intent?"); expect(reasonField).toHaveValue(originalReason); expect(reasonField).toBeDisabled(); expect(screen.getByText(/Original immutable reason retained/i)).toBeInTheDocument();
    await acknowledgeIntent(user); await user.click(screen.getByRole("button", { name: "Check same release intent" }));
    expect(jobsAPI.recordReconciliationResolution).toHaveBeenCalledWith("job-a", runId, { proofId, expectedTransitionSequence: 7, reason: originalReason }, idempotencyKey);
  });

  it("treats a well-formed but mismatched resolution identity as ambiguous without refreshing", async () => {
    const user = userEvent.setup(); const mismatchedResolutionId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(jobsAPI.recordReconciliationResolution).mockResolvedValueOnce({ data: { resolutionId: mismatchedResolutionId, runId, status: "UNKNOWN", releaseIntentRecorded: true, originalHoldObservation: "ABSENT", targetAvailability: "NOT_ESTABLISHED" } } as never);
    renderPanel(); await inspect(user); await user.type(screen.getByLabelText("Why record this release intent?"), "Reason"); await acknowledgeIntent(user); await user.click(screen.getByRole("button", { name: "Record release intent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/may have been recorded/i); expect(jobsAPI.getReconciliation).toHaveBeenCalledTimes(1);
    const submittedKey = vi.mocked(jobsAPI.recordReconciliationResolution).mock.calls[0][3]; expect(submittedKey).not.toBe(mismatchedResolutionId); expect(sessionStorage.getItem(`axon.reconciliation.pending.v1:org-a:actor-a:job-a:${runId}`)).toContain(submittedKey);
  });

  it("hides protected data on a late denial and ignores an earlier overlapping success", async () => {
    const user = userEvent.setup(); let first: (value: unknown) => void = () => undefined; let second: (reason: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getReconciliation).mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }) as never).mockImplementationOnce(() => new Promise((_resolve, reject) => { second = reject; }) as never);
    renderPanel(); await user.type(screen.getByLabelText("Run ID"), runId); const inspectButton = screen.getByRole("button", { name: "Inspect reconciliation" }); await user.click(inspectButton); await user.click(inspectButton);
    await act(async () => { second({ response: { status: 403 } }); }); await screen.findByRole("alert");
    await act(async () => { first({ data: record() }); });
    expect(screen.queryByText("agent-original")).not.toBeInTheDocument();
  });

  it("fails closed for viewers, default-off, unsupported proof, and unavailable evidence", async () => {
    const user = userEvent.setup();
    for (const blockedReason of ["READ_ONLY_ACTOR", "FEATURE_DISABLED", "NO_SUPPORTED_PROOF", "EVIDENCE_UNAVAILABLE"] as const) {
      vi.mocked(jobsAPI.getReconciliation).mockResolvedValueOnce({ data: record({ eligible: false, blockedReason, proof: null }) } as never);
      const view = renderPanel(); await inspect(user); expect(screen.queryByRole("button", { name: /release intent/i })).not.toBeInTheDocument(); view.unmount();
    }
  });

  it("clears state on organization, actor, or job changes and ignores a late response after unmount", async () => {
    const user = userEvent.setup(); let resolve: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getReconciliation).mockImplementationOnce(() => new Promise((done) => { resolve = done; }) as never);
    const view = renderPanel(); await user.type(screen.getByLabelText("Run ID"), runId); await user.click(screen.getByRole("button", { name: "Inspect reconciliation" })); view.rerender(<ReconciliationPanel jobId="job-b" orgId="org-b" actorId="actor-b" />); expect(screen.getByText("No reconciliation state is loaded.")).toBeInTheDocument(); view.unmount(); await act(async () => { resolve({ data: record() }); });
  });

  it("synchronously hides protected details and action when organization context changes", async () => {
    const user = userEvent.setup(); const view = renderPanel(); await inspect(user);
    expect(screen.getByText("agent-original")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Record release intent" })).toBeInTheDocument();
    view.rerender(<ReconciliationPanel jobId="job-a" orgId="org-b" actorId="actor-a" />);
    expect(screen.queryByText("agent-original")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Record release intent" })).not.toBeInTheDocument(); expect(screen.getByText("No reconciliation state is loaded.")).toBeInTheDocument();
  });

  it("does not reuse a request identity when the protected proof changes", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(`axon.reconciliation.pending.v1:org-a:actor-a:job-a:${runId}`, JSON.stringify({ version: 1, runId, body: { proofId: "not-a-uuid", expectedTransitionSequence: 6, reason: "Old proof" }, idempotencyKey: "not-a-uuid" }));
    renderPanel(); await inspect(user);
    expect(screen.getByText(/saved recovery identity was invalid/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record release intent" })).not.toBeInTheDocument();
  });

  it("invalidates newer protected data when an older request is later denied", async () => {
    const user = userEvent.setup(); let olderReject: (reason: unknown) => void = () => undefined; let newerResolve: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.getReconciliation).mockImplementationOnce(() => new Promise((_resolve, reject) => { olderReject = reject; }) as never).mockImplementationOnce(() => new Promise((resolve) => { newerResolve = resolve; }) as never);
    renderPanel(); await user.type(screen.getByLabelText("Run ID"), runId); const inspectButton = screen.getByRole("button", { name: "Inspect reconciliation" }); await user.click(inspectButton); await user.click(inspectButton);
    await act(async () => { newerResolve({ data: record() }); }); await screen.findByText("agent-original");
    await act(async () => { olderReject({ response: { status: 403 } }); });
    expect(screen.queryByText("agent-original")).not.toBeInTheDocument(); expect(screen.getByRole("alert")).toHaveTextContent(/protected reconciliation state is unavailable/i);
  });

  it("synchronously fences the loaded record when the selected run changes", async () => {
    const user = userEvent.setup(); renderPanel(); await inspect(user);
    await user.clear(screen.getByLabelText("Run ID")); await user.type(screen.getByLabelText("Run ID"), "33333333-3333-4333-8333-333333333333");
    expect(screen.queryByText("agent-original")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Record release intent" })).not.toBeInTheDocument(); expect(jobsAPI.recordReconciliationResolution).not.toHaveBeenCalled();
  });

  it("keeps the pending identity after unmount during a post and performs no late cleanup", async () => {
    const user = userEvent.setup(); let resolvePost: (value: unknown) => void = () => undefined;
    vi.mocked(jobsAPI.recordReconciliationResolution).mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }) as never);
    const view = renderPanel(); await inspect(user); await user.type(screen.getByLabelText("Why record this release intent?"), "Bounded reason"); await acknowledgeIntent(user); await user.click(screen.getByRole("button", { name: "Record release intent" }));
    const key = `axon.reconciliation.pending.v1:org-a:actor-a:job-a:${runId}`; expect(sessionStorage.getItem(key)).not.toBeNull(); view.unmount();
    await act(async () => { resolvePost({ data: { resolutionId: "22222222-2222-4222-8222-222222222222", runId, status: "UNKNOWN", releaseIntentRecorded: true, originalHoldObservation: "ABSENT", targetAvailability: "NOT_ESTABLISHED" } }); });
    expect(sessionStorage.getItem(key)).not.toBeNull();
  });

  it("clears protected state when the post-success reconciliation refresh is denied", async () => {
    const user = userEvent.setup();
    vi.mocked(jobsAPI.getReconciliation).mockResolvedValueOnce({ data: record() } as never).mockRejectedValueOnce({ response: { status: 403 } } as never);
    renderPanel(); await inspect(user); await user.type(screen.getByLabelText("Why record this release intent?"), "Bounded reason"); await acknowledgeIntent(user);
    await user.click(screen.getByRole("button", { name: "Record release intent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/protected reconciliation state is unavailable/i);
    expect(screen.queryByText("agent-original")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record release intent" })).not.toBeInTheDocument();
  });

  it.each([
    ["run", { runId: "33333333-3333-4333-8333-333333333333" }],
    ["resolution", { resolutionId: "not-a-uuid" }],
    ["status", { status: "COMPLETED" }],
    ["hold", { originalHoldObservation: "PRESENT" }],
    ["target availability", { targetAvailability: "AVAILABLE" }],
  ])("treats a malformed nominal success (%s) as ambiguous", async (_name, override) => {
    const user = userEvent.setup(); vi.mocked(jobsAPI.recordReconciliationResolution).mockImplementationOnce((_jobId, _runId, _body, idempotencyKey) => Promise.resolve({ data: { resolutionId: idempotencyKey, runId, status: "UNKNOWN", releaseIntentRecorded: true, originalHoldObservation: "ABSENT", targetAvailability: "NOT_ESTABLISHED", ...override } }) as never);
    renderPanel(); await inspect(user); await user.type(screen.getByLabelText("Why record this release intent?"), "Reason"); await acknowledgeIntent(user); await user.click(screen.getByRole("button", { name: "Record release intent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/may have been recorded/i); expect(screen.getByRole("button", { name: "Check same release intent" })).toBeInTheDocument();
  });

  it("fails closed if pending storage cannot be written and does not post", async () => {
    const user = userEvent.setup(); const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    renderPanel(); await inspect(user); await user.type(screen.getByLabelText("Why record this release intent?"), "Reason"); await acknowledgeIntent(user); await user.click(screen.getByRole("button", { name: "Record release intent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be retained safely/i); expect(jobsAPI.recordReconciliationResolution).not.toHaveBeenCalled(); write.mockRestore();
  });

  it("does not issue reads automatically under StrictMode", () => {
    render(<StrictMode><ReconciliationPanel jobId="job-a" orgId="org-a" actorId="actor-a" /></StrictMode>);
    expect(jobsAPI.getReconciliation).not.toHaveBeenCalled();
  });

  it("inspects successfully after StrictMode lifecycle setup and cleanup", async () => {
    const user = userEvent.setup(); render(<StrictMode><ReconciliationPanel jobId="job-a" orgId="org-a" actorId="actor-a" /></StrictMode>);
    await inspect(user);
    expect(screen.getByText("agent-original")).toBeInTheDocument(); expect(jobsAPI.getReconciliation).toHaveBeenCalledTimes(1);
  });
});
