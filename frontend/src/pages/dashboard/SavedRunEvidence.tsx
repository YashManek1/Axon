import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { jobsAPI, type SavedRunEvidence as SavedRun } from "../../services/api";
import { formatSavedRunHandoff, normalizeRunUuid, type SavedRunHandoff } from "./savedRunHandoff";

type LoadState = "loading" | "ready" | "stale" | "failure" | "permission";
type HandoffPreview = SavedRunHandoff & { context: string; runId: string; generation: number };

function isPermissionError(error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function consequence(run: SavedRun) {
  const status = typeof run.status === "string" ? run.status.toUpperCase() : "UNKNOWN";
  if (status === "UNKNOWN" || run.requiresReview) return "Effects cannot be confirmed.";
  if (status === "ACCEPTED") return "This records durable acceptance only; it does not confirm queueing or execution.";
  if (status === "QUEUED") return "This records a saved queue transition, not current queue availability.";
  if (status === "DISPATCHING" || status === "ACKNOWLEDGED") return "Dispatch acknowledgement is not completion.";
  if (["FAILED", "TIMED_OUT", "CANCELLED"].includes(status)) return "This status does not prove the command had no effects.";
  return null;
}

function EvidenceDetail({ run }: { run: SavedRun }) {
  const interpretation = consequence(run);
  return <div className="mt-4 rounded-sm border border-edge bg-bg p-4" aria-live="polite">
    <h3 className="font-ui font-bold text-sm text-ink">Original run</h3>
    <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs uppercase tracking-wide text-muted">Run ID</dt><dd className="mt-1 break-all font-mono text-ink">{run.runId}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-muted">Original target</dt><dd className="mt-1 break-all font-mono text-ink">{run.targetAgentId || "Not recorded"}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-muted">Saved status</dt><dd className="mt-1 font-mono text-ink">{run.status}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-muted">Reason</dt><dd className="mt-1 break-words font-mono text-ink">{run.reasonCode || "Not recorded"}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-muted">Created</dt><dd className="mt-1 font-mono text-ink">{formatDate(run.createdAt)}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-muted">Completed</dt><dd className="mt-1 font-mono text-ink">{formatDate(run.completedAt)}</dd></div>
    </dl>
    {interpretation && <p className="mt-3 rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink-2" role="alert">{interpretation}</p>}
    <p className="mt-3 text-sm text-muted">Retain correlated IDs, ask the responsible operator to inspect the original target, and do not rerun or clear holds to resolve uncertainty.</p>
    <h4 className="mt-4 font-ui font-bold text-sm text-ink">Attempts</h4>
    {run.attempts?.length ? <ul className="mt-2 space-y-2 text-xs text-ink-2">{run.attempts.map((attempt, index) => <li className="rounded-sm border border-edge p-2" key={`${attempt.attemptId ?? "attempt"}-${attempt.sequence ?? index}`}><span className="font-mono">{attempt.attemptId || "Attempt ID not recorded"}</span> · {attempt.status || "status not recorded"} · target execution {attempt.targetExecutionId || "not recorded"} · operation {attempt.operationId || "not recorded"}<br />Outcome: {attempt.outcome || "not recorded"} · exit code: {attempt.exitCode ?? "not recorded"} · completed: {formatDate(attempt.completedAt)}</li>)}</ul> : <p className="mt-2 text-sm text-muted">No saved attempts.</p>}
    <h4 className="mt-4 font-ui font-bold text-sm text-ink">Transitions</h4>
    {run.transitions?.length ? <ol className="mt-2 space-y-2 text-xs text-ink-2">{run.transitions.map((transition, index) => <li className="rounded-sm border border-edge p-2" key={`${transition.sequence ?? index}-${transition.at ?? "time"}`}>#{transition.sequence ?? "?"} {transition.from || "?"} → {transition.to || "?"} · {formatDate(transition.at)} · {transition.reasonCode || "no reason recorded"}</li>)}</ol> : <p className="mt-2 text-sm text-muted">No saved transitions.</p>}
    <h4 className="mt-4 font-ui font-bold text-sm text-ink">Terminal summary</h4>
    {run.terminalSummary ? <p className="mt-2 rounded-sm border border-edge p-2 text-xs text-ink-2">Status: {run.terminalSummary.status || "not recorded"} · outcome: {run.terminalSummary.outcome || "not recorded"} · exit code: {run.terminalSummary.exitCode ?? "not recorded"}<br />Reason: {run.terminalSummary.reasonCode || "not recorded"} · completed: {formatDate(run.terminalSummary.completedAt)}</p> : <p className="mt-2 text-sm text-muted">No saved terminal summary.</p>}
  </div>;
}

export default function SavedRunEvidence({ jobId, orgId, actorId }: { jobId: string; orgId?: string; actorId?: string }) {
  const contextKey = orgId && actorId && jobId ? `${orgId}:${actorId}:${jobId}` : null;
  const activeContext = useRef(contextKey);
  const mounted = useRef(true);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const handoffRequest = useRef(0);
  const epoch = useRef(0);
  const loadedContext = useRef<string | null>(null);
  const hasEvidence = useRef(false);
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [selected, setSelected] = useState<SavedRun | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
  const [evidenceContext, setEvidenceContext] = useState<string | null>(null);
  const [evidenceGeneration, setEvidenceGeneration] = useState(0);
  const [preview, setPreview] = useState<HandoffPreview | null>(null);
  const [handoffFeedback, setHandoffFeedback] = useState<string | null>(null);

  const clearHandoff = () => { handoffRequest.current += 1; setPreview(null); setHandoffFeedback(null); };
  const denyAll = (error: unknown) => {
    epoch.current += 1; listRequest.current += 1; detailRequest.current += 1; handoffRequest.current += 1;
    setEvidenceGeneration(epoch.current);
    hasEvidence.current = false;
    setRuns([]); setHasMore(false); setSelected(null); setLookupError(null); setPreview(null); setHandoffFeedback(null);
    setReauthenticationRequired((error as { response?: { status?: number } } | null)?.response?.status === 401);
    setState("permission");
  };

  useLayoutEffect(() => {
    if (activeContext.current !== contextKey) {
      activeContext.current = contextKey;
      listRequest.current += 1;
      detailRequest.current += 1;
      handoffRequest.current += 1;
      epoch.current += 1;
    }
  }, [contextKey]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current += 1; listRequest.current += 1; detailRequest.current += 1; handoffRequest.current += 1; };
  }, []);

  useEffect(() => {
    const requestContext = contextKey;
    const requestEpoch = epoch.current;
    const requestId = ++listRequest.current;
    const isAuthorizationRelevant = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch;
    const isCurrent = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch && listRequest.current === requestId;
    const updateCurrent = (update: () => void) => queueMicrotask(() => { if (isCurrent()) update(); });
    const changingContext = loadedContext.current !== requestContext;
    if (changingContext) {
      updateCurrent(() => {
        loadedContext.current = requestContext;
        hasEvidence.current = false;
        setEvidenceContext(requestContext);
        setRuns([]); setHasMore(false); setSelected(null); setLookupId(""); setLookupError(null); setReauthenticationRequired(false); setPreview(null); setHandoffFeedback(null);
      });
    }
    handoffRequest.current += 1;
    updateCurrent(() => { setEvidenceGeneration(requestEpoch); setPreview(null); setHandoffFeedback(null); });
    updateCurrent(() => setState("loading"));
    if (!requestContext) { updateCurrent(() => setState("permission")); return; }
    void jobsAPI.listRuns(jobId).then((response) => {
      if (!isCurrent()) return;
      if (!Array.isArray(response.data?.runs)) { clearHandoff(); setState(hasEvidence.current ? "stale" : "failure"); return; }
      setRuns(response.data.runs);
      setHasMore(Boolean(response.data?.hasMore));
      hasEvidence.current = true;
      setState("ready");
    }).catch((error: unknown) => {
      if (isPermissionError(error)) {
        if (isAuthorizationRelevant()) denyAll(error);
        return;
      }
      if (!isCurrent()) return;
      else { clearHandoff(); setState(hasEvidence.current ? "stale" : "failure"); }
    });
  }, [contextKey, jobId, refreshToken]);

  const inspect = async (runId: string) => {
    const requestContext = contextKey;
    const requestEpoch = epoch.current;
    const requestId = ++detailRequest.current;
    const isAuthorizationRelevant = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch;
    const isCurrent = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch && detailRequest.current === requestId;
    clearHandoff();
    setSelected(null);
    if (!requestContext) return;
    setLookupError(null);
    try {
      const response = await jobsAPI.getRun(jobId, runId);
      if (!isCurrent()) return;
      if (!response.data || !normalizeRunUuid(runId) || normalizeRunUuid(response.data.runId) !== normalizeRunUuid(runId)) { setSelected(null); setLookupError("Saved run evidence is unavailable. Do not infer an outcome from unavailable evidence."); return; }
      setSelected(response.data);
    } catch (error) {
      if (isPermissionError(error)) {
        if (isAuthorizationRelevant()) denyAll(error);
        return;
      }
      if (!isCurrent()) return;
      else { setSelected(null); setLookupError("Saved run evidence could not be loaded. Existing evidence may be stale or unavailable."); }
    }
  };

  const prepareHandoff = async () => {
    const runId = selected?.runId;
    const requestContext = contextKey;
    const requestEpoch = epoch.current;
    const requestId = ++handoffRequest.current;
    const isAuthorizationRelevant = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch;
    const isCurrent = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch && handoffRequest.current === requestId;
    setPreview(null); setHandoffFeedback(null);
    if (!requestContext || !runId) return;
    try {
      const response = await jobsAPI.getRun(jobId, runId);
      if (!isCurrent()) return;
      const formatted = formatSavedRunHandoff(response.data, jobId, runId);
      if ("error" in formatted) { setHandoffFeedback("Saved-run handoff is unavailable because its original identity could not be verified."); return; }
      setPreview({ ...formatted.handoff, context: requestContext, runId, generation: requestEpoch });
      setHandoffFeedback("Review this fresh saved-run snapshot before copying it.");
    } catch (error) {
      if (isPermissionError(error)) {
        if (isAuthorizationRelevant()) denyAll(error);
        return;
      }
      if (!isCurrent()) return;
      setHandoffFeedback("Saved-run handoff is unavailable or stale. Do not infer an outcome from unavailable evidence.");
    }
  };

  const copyHandoff = async () => {
    if (!preview || !selected || !contextKey) return;
    if (preview.context !== contextKey || preview.runId !== selected.runId || preview.generation !== epoch.current) { clearHandoff(); return; }
    const requestContext = contextKey;
    const requestEpoch = epoch.current;
    const runId = selected.runId;
    const requestId = ++handoffRequest.current;
    const isAuthorizationRelevant = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch;
    const isCurrent = () => mounted.current && activeContext.current === requestContext && epoch.current === requestEpoch && handoffRequest.current === requestId;
    setHandoffFeedback(null);
    try {
      const response = await jobsAPI.getRun(jobId, runId);
      if (!isCurrent()) return;
      const formatted = formatSavedRunHandoff(response.data, jobId, runId);
      if ("error" in formatted) { setPreview(null); setHandoffFeedback("Saved-run handoff is unavailable because its original identity could not be verified."); return; }
      if (formatted.handoff.canonical !== preview.canonical) { setPreview({ ...formatted.handoff, context: requestContext, runId, generation: requestEpoch }); setHandoffFeedback("The saved run changed. Review the new snapshot before copying it."); return; }
      if (!navigator.clipboard?.writeText) { setPreview(null); setHandoffFeedback("Saved-run handoff could not be copied. Clipboard access is unavailable."); return; }
      if (!isCurrent()) return;
      await navigator.clipboard.writeText(formatted.handoff.text);
      if (isCurrent()) setHandoffFeedback("Saved-run handoff copied to the clipboard.");
    } catch (error) {
      if (isPermissionError(error)) {
        if (isAuthorizationRelevant()) denyAll(error);
        return;
      }
      if (!isCurrent()) return;
      setPreview(null); setHandoffFeedback("Saved-run handoff could not be copied. Review remains required.");
    }
  };

  const submitLookup = (event: React.FormEvent) => {
    event.preventDefault();
    clearHandoff();
    if (!normalizeRunUuid(lookupId)) { setLookupError("Enter an exact canonical run UUID to inspect an older or original run."); return; }
    void inspect(lookupId);
  };

  const contextIsVisible = evidenceContext === contextKey;
  const visibleRuns = contextIsVisible ? runs : [];
  const visibleSelected = contextIsVisible ? selected : null;
  const visibleHasMore = contextIsVisible && hasMore;
  const visiblePreview = preview && preview.context === contextKey && preview.runId === selected?.runId && preview.generation === evidenceGeneration ? preview : null;

  return <section className="mb-4 rounded-md border border-edge bg-surface p-4" aria-labelledby="saved-run-evidence-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="saved-run-evidence-title" className="font-ui font-bold text-sm text-ink">Saved run evidence</h2><p className="mt-1 text-sm text-muted">Latest 10 saved runs{visibleHasMore ? "; more exist" : ""}. This list is not exhaustive.</p></div><button type="button" className="h-8 rounded-sm border border-edge px-3 text-sm text-muted hover:bg-surface-2" onClick={() => { clearHandoff(); setRefreshToken((value) => value + 1); }}>Refresh evidence</button></div>
    {state === "loading" && <p className="mt-3 text-sm text-muted" role="status">Loading saved run evidence…</p>}
    {state === "permission" && <p className="mt-3 text-sm text-danger" role="alert">{reauthenticationRequired ? "Your session is no longer authorized to view saved run evidence. Sign in again to inspect it." : "You do not have permission to view saved run evidence."}</p>}
    {state === "failure" && <p className="mt-3 text-sm text-danger" role="alert">Saved run evidence is unavailable. Do not infer an outcome from missing evidence.</p>}
    {state === "stale" && <p className="mt-3 text-sm text-warning" role="alert">Saved run evidence is stale or unavailable.</p>}
    {state === "ready" && contextIsVisible && !visibleRuns.length && <p className="mt-3 text-sm text-muted">No saved runs are available for this job.</p>}
    {state !== "permission" && visibleRuns.length > 0 && <ul className="mt-3 space-y-2">{visibleRuns.map((run) => <li key={run.runId} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-edge p-2"><span className="break-all font-mono text-xs text-ink">{run.runId} · {run.status}</span><button type="button" className="h-8 rounded-sm border border-edge px-3 text-sm text-muted hover:bg-surface-2" onClick={() => void inspect(run.runId)}>Inspect saved run</button></li>)}</ul>}
    {state !== "permission" && <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={submitLookup}><label className="flex min-w-0 flex-1 basis-64 flex-col gap-1 text-sm text-muted" htmlFor="saved-run-id">Older or original run UUID<input id="saved-run-id" className="h-8 min-w-0 rounded-sm border border-edge bg-bg px-2 font-mono text-sm text-ink" value={lookupId} onChange={(event) => setLookupId(event.target.value)} /></label><button type="submit" className="h-8 rounded-sm border border-edge px-3 text-sm text-muted hover:bg-surface-2">Inspect exact run</button></form>}
    {lookupError && <p className="mt-3 text-sm text-warning" role="alert">{lookupError}</p>}
    {visibleSelected && <><EvidenceDetail run={visibleSelected} /><div className="mt-4 rounded-sm border border-edge bg-surface-2 p-3" aria-labelledby="saved-run-handoff-title"><h3 id="saved-run-handoff-title" className="font-ui text-sm font-bold text-ink">Saved-run handoff</h3><p className="mt-1 text-sm text-muted">Prepare a fresh snapshot, review it, then explicitly copy a separately reauthorized fresh read.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-8 rounded-sm border border-edge px-3 text-sm text-ink hover:bg-surface" onClick={() => void prepareHandoff()}>Prepare saved-run handoff</button>{visiblePreview && <button type="button" className="min-h-8 rounded-sm bg-primary px-3 text-sm text-white hover:bg-primary-hover" onClick={() => void copyHandoff()}>Copy reviewed handoff</button>}</div>{handoffFeedback && <p className="mt-3 text-sm text-muted" role="status">{handoffFeedback}</p>}{visiblePreview && <pre data-testid="saved-run-handoff-preview" className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-edge bg-bg p-3 font-mono text-xs text-ink">{visiblePreview.text}</pre>}</div></>}
  </section>;
}
