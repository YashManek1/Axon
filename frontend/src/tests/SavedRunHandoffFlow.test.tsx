/* @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedRunEvidence from "../pages/dashboard/SavedRunEvidence";
import { jobsAPI } from "../services/api";

vi.mock("../services/api", () => ({ jobsAPI: { listRuns: vi.fn(), getRun: vi.fn() } }));
const jobId = "507f1f77bcf86cd799439011";
const run = { jobId, runId: "11111111-1111-4111-8111-111111111111", targetAgentId: "507f1f77bcf86cd799439012", status: "UNKNOWN", requiresReview: true, attempts: [], transitions: [] };
const response = (data: unknown) => ({ data }) as never;
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise: promise as never, resolve, reject };
}
let writeText: ReturnType<typeof vi.fn>;
async function expectPermissionClear(status: number) {
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(status === 401 ? "Sign in again" : "do not have permission");
  expect(screen.queryByRole("button", { name: "Inspect saved run" })).not.toBeInTheDocument();
  expect(screen.queryByText("Original run")).not.toBeInTheDocument();
  expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
}
async function prepared() {
  const user = userEvent.setup();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const view = render(<StrictMode><SavedRunEvidence jobId={jobId} orgId="org-a" actorId="viewer-a" /></StrictMode>);
  await user.click(await screen.findByRole("button", { name: "Inspect saved run" }));
  await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
  await screen.findByTestId("saved-run-handoff-preview");
  return { user, view };
}
describe("handoff authority and race guards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(jobsAPI.listRuns).mockResolvedValue(response({ runs: [run], hasMore: false }));
    vi.mocked(jobsAPI.getRun).mockResolvedValue(response(run));
  });
  it("copies for an authorized viewer only after three separate exact reads", async () => {
    const { user } = await prepared();
    expect(writeText).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(jobsAPI.getRun).toHaveBeenCalledTimes(3);
    for (const args of vi.mocked(jobsAPI.getRun).mock.calls) expect(args).toEqual([jobId, run.runId]);
    expect(writeText.mock.calls[0][0]).toContain("cannot confirm effects"); // uncertainty caveat, not an inferred success
  });
  it("requires a renewed review click when fresh evidence changes", async () => {
    const { user } = await prepared();
    vi.mocked(jobsAPI.getRun).mockResolvedValue(response({ ...run, status: "FAILED" }));
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    expect(await screen.findByRole("status")).toHaveTextContent("changed");
    expect(writeText).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Saved status: FAILED");
  });
  it.each([null, { response: { status: 404 } }, { response: { status: 503 } }])("clears export on failed copy read %j", async (error) => {
    const { user } = await prepared();
    vi.mocked(jobsAPI.getRun).mockRejectedValueOnce(error);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    expect(await screen.findByRole("status")).toHaveTextContent("could not be copied");
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...run, jobId: "507f1f77bcf86cd799439099" }, { ...run, runId: "bad" }])("rejects malformed or mismatched fresh export %j", async (data) => {
    const { user } = await prepared();
    vi.mocked(jobsAPI.getRun).mockResolvedValueOnce(response(data));
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    expect(await screen.findByRole("status")).toHaveTextContent("identity could not be verified");
    expect(screen.queryByRole("button", { name: "Copy reviewed handoff" })).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each([401, 403])("copy denial %i clears every lane and ignores a pending list success", async (status) => {
    const { user } = await prepared();
    const list = deferred();
    vi.mocked(jobsAPI.listRuns).mockReturnValueOnce(list.promise);
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await screen.findByTestId("saved-run-handoff-preview");
    vi.mocked(jobsAPI.getRun).mockRejectedValueOnce({ response: { status } });
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await waitFor(() => expect(screen.queryByText("Original run")).not.toBeInTheDocument());
    await act(async () => { list.resolve(response({ runs: [run], hasMore: false })); });
    expect(screen.queryByRole("button", { name: "Inspect saved run" })).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
    // Recovery must be an explicit new read, and cannot treat cleared state as stale evidence.
    vi.mocked(jobsAPI.listRuns).mockRejectedValueOnce({ response: { status: 503 } });
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Do not infer an outcome");
  });
  it.each([401, 403])("list denial %i cancels a pending copy GET", async (status) => {
    const { user } = await prepared();
    const list = deferred(); const copy = deferred();
    vi.mocked(jobsAPI.listRuns).mockReturnValueOnce(list.promise);
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await screen.findByTestId("saved-run-handoff-preview");
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(copy.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await act(async () => { list.reject({ response: { status } }); });
    await screen.findByRole("alert");
    await act(async () => { copy.resolve(response(run)); });
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it("refresh immediately cancels an older pending copy, even when the refresh fails", async () => {
    const { user } = await prepared(); const copy = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(copy.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    vi.mocked(jobsAPI.listRuns).mockRejectedValueOnce({ response: { status: 503 } });
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await act(async () => { copy.resolve(response(run)); });
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each(["actor", "org", "job", "unmount", "run"])("context change %s suppresses a late copy read", async (change) => {
    const { user, view } = await prepared(); const copy = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(copy.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    if (change === "unmount") view.unmount();
    else if (change === "run") {
      await user.type(screen.getByLabelText("Older or original run UUID"), "22222222-2222-4222-8222-222222222222");
      await user.click(screen.getByRole("button", { name: "Inspect exact run" }));
    } else view.rerender(<StrictMode><SavedRunEvidence jobId={change === "job" ? "507f1f77bcf86cd799439099" : jobId} orgId={change === "org" ? "org-b" : "org-a"} actorId={change === "actor" ? "viewer-b" : "viewer-a"} /></StrictMode>);
    await act(async () => { copy.resolve(response(run)); });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
  });
  it("does not claim reversal or success after an already invoked clipboard write outlives context", async () => {
    const { user, view } = await prepared(); const clipboard = deferred();
    writeText.mockReturnValueOnce(clipboard.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    view.rerender(<StrictMode><SavedRunEvidence jobId={jobId} orgId="org-b" actorId="viewer-a" /></StrictMode>);
    await act(async () => { clipboard.resolve(undefined); });
    expect(screen.queryByText("Saved-run handoff copied to the clipboard.")).not.toBeInTheDocument();
  });
  it("clipboard failure clears the preview without displaying raw error contents", async () => {
    const { user } = await prepared();
    writeText.mockRejectedValueOnce(new Error("SECRET_CLIPBOARD"));
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    expect(await screen.findByRole("status")).toHaveTextContent("could not be copied");
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("SECRET_CLIPBOARD");
  });
  it.each([401, 403])("accepts a superseded list denial %i after a newer list success", async (status) => {
    const user = userEvent.setup();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<StrictMode><SavedRunEvidence jobId={jobId} orgId="org-a" actorId="viewer-a" /></StrictMode>);
    await screen.findByRole("button", { name: "Inspect saved run" });
    const older = deferred(); const newer = deferred();
    vi.mocked(jobsAPI.listRuns).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await act(async () => { newer.resolve(response({ runs: [run], hasMore: false })); });
    await act(async () => { older.reject({ response: { status } }); });
    await expectPermissionClear(status);
  });
  it.each([401, 403])("accepts a superseded list denial %i before a newer list success", async (status) => {
    const user = userEvent.setup();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<StrictMode><SavedRunEvidence jobId={jobId} orgId="org-a" actorId="viewer-a" /></StrictMode>);
    await screen.findByRole("button", { name: "Inspect saved run" });
    const older = deferred(); const newer = deferred();
    vi.mocked(jobsAPI.listRuns).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await act(async () => { older.reject({ response: { status } }); });
    await expectPermissionClear(status);
    await act(async () => { newer.resolve(response({ runs: [run], hasMore: false })); });
    expect(screen.queryByRole("button", { name: "Inspect saved run" })).not.toBeInTheDocument();
  });
  it.each([401, 403])("accepts a superseded detail denial %i before a newer detail success", async (status) => {
    const { user } = await prepared();
    const older = deferred(); const newer = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await user.click(screen.getByRole("button", { name: "Inspect saved run" }));
    await user.click(screen.getByRole("button", { name: "Inspect saved run" }));
    await act(async () => { older.reject({ response: { status } }); });
    await expectPermissionClear(status);
    await act(async () => { newer.resolve(response(run)); });
    expect(screen.queryByText("Original run")).not.toBeInTheDocument();
  });
  it.each([401, 403])("accepts a superseded detail denial %i after a newer detail success", async (status) => {
    const { user } = await prepared();
    const older = deferred(); const newer = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await user.click(screen.getByRole("button", { name: "Inspect saved run" }));
    await user.click(screen.getByRole("button", { name: "Inspect saved run" }));
    await act(async () => { newer.resolve(response(run)); });
    await screen.findByText("Original run");
    await act(async () => { older.reject({ response: { status } }); });
    await expectPermissionClear(status);
  });
  it.each([401, 403])("accepts a superseded prepare denial %i after a newer prepare success", async (status) => {
    const { user } = await prepared();
    const older = deferred(); const newer = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await act(async () => { newer.resolve(response(run)); });
    await screen.findByTestId("saved-run-handoff-preview");
    await act(async () => { older.reject({ response: { status } }); });
    await expectPermissionClear(status);
  });
  it.each([401, 403])("accepts a superseded prepare denial %i before a newer prepare success", async (status) => {
    const { user } = await prepared();
    const older = deferred(); const newer = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await act(async () => { older.reject({ response: { status } }); });
    await expectPermissionClear(status);
    await act(async () => { newer.resolve(response(run)); });
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
  });
  it.each([401, 403])("copy/prepare overlap %i prevents clipboard work after an older copy denial", async (status) => {
    const { user } = await prepared();
    const olderCopy = deferred(); const newerPrepare = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(olderCopy.promise).mockReturnValueOnce(newerPrepare.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await act(async () => { olderCopy.reject({ response: { status } }); });
    await expectPermissionClear(status);
    await act(async () => { newerPrepare.resolve(response(run)); });
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each([401, 403])("copy/prepare overlap %i clears a newer prepared preview before the older copy denial", async (status) => {
    const { user } = await prepared();
    const olderCopy = deferred(); const newerPrepare = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(olderCopy.promise).mockReturnValueOnce(newerPrepare.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await act(async () => { newerPrepare.resolve(response(run)); });
    await screen.findByTestId("saved-run-handoff-preview");
    await act(async () => { olderCopy.reject({ response: { status } }); });
    await expectPermissionClear(status);
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each([401, 403])("prepare A, prepare B, copy C race %i clears and blocks the pending copy", async (status) => {
    const { user } = await prepared();
    const prepareA = deferred(); const prepareB = deferred(); const copyC = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(prepareA.promise).mockReturnValueOnce(prepareB.promise).mockReturnValueOnce(copyC.promise);
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await user.click(screen.getByRole("button", { name: "Prepare saved-run handoff" }));
    await act(async () => { prepareB.resolve(response(run)); });
    await screen.findByTestId("saved-run-handoff-preview");
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await act(async () => { prepareA.reject({ response: { status } }); });
    await expectPermissionClear(status);
    await act(async () => { copyC.resolve(response(run)); });
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each([401, 403])("copy/copy overlap %i suppresses success after an invoked clipboard write", async (status) => {
    const { user } = await prepared();
    const olderCopy = deferred(); const newerCopy = deferred(); const clipboard = deferred();
    writeText.mockReturnValueOnce(clipboard.promise);
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(olderCopy.promise).mockReturnValueOnce(newerCopy.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await act(async () => { newerCopy.resolve(response(run)); });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await act(async () => { olderCopy.reject({ response: { status } }); });
    await expectPermissionClear(status);
    await act(async () => { clipboard.resolve(undefined); });
    expect(screen.queryByText("Saved-run handoff copied to the clipboard.")).not.toBeInTheDocument();
  });
  it.each([401, 403])("copy/copy overlap %i blocks a later copy success after the first denial", async (status) => {
    const { user } = await prepared();
    const copyA = deferred(); const copyB = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(copyA.promise).mockReturnValueOnce(copyB.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    await act(async () => { copyA.reject({ response: { status } }); });
    await expectPermissionClear(status);
    await act(async () => { copyB.resolve(response(run)); });
    expect(screen.queryByTestId("saved-run-handoff-preview")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved-run handoff copied to the clipboard.")).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each(["context", "prior epoch", "unmount"])("ignores a stale permission denial after %s", async (kind) => {
    const { user, view } = await prepared();
    const oldRead = deferred();
    vi.mocked(jobsAPI.getRun).mockReturnValueOnce(oldRead.promise);
    await user.click(screen.getByRole("button", { name: "Copy reviewed handoff" }));
    if (kind === "context") {
      view.rerender(<StrictMode><SavedRunEvidence jobId={jobId} orgId="org-b" actorId="viewer-a" /></StrictMode>);
    } else if (kind === "prior epoch") {
      vi.mocked(jobsAPI.getRun).mockRejectedValueOnce({ response: { status: 403 } });
      await user.click(screen.getByRole("button", { name: "Inspect saved run" }));
      await expectPermissionClear(403);
      await user.click(screen.getByRole("button", { name: "Refresh evidence" }));
      await screen.findByRole("button", { name: "Inspect saved run" });
    } else view.unmount();
    await act(async () => { oldRead.reject({ response: { status: 401 } }); });
    if (kind === "context") expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    if (kind === "prior epoch") expect(screen.queryByRole("button", { name: "Inspect saved run" })).toBeInTheDocument();
  });
});
