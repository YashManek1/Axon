import { BookOpen } from "lucide-react";

const planned = [
  "Named DAGs of shell / HTTP steps with dependsOn wiring",
  "Step stays blocked until all dependencies complete",
  "DAG-level audit record: each step's exit code and duration",
  "Replay any past runbook execution from the audit log",
  "Approval gates and variable interpolation (post-v1)",
];

export default function RunbooksPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Runbooks</h1>
        <p className="text-muted mt-2">Pre-approved command graphs with dependency-aware execution</p>
      </div>

      <div className="bg-surface border border-edge rounded-md p-16 text-center mb-5">
        <div className="flex justify-center mb-4"><BookOpen size={22} className="text-muted" /></div>
        <h3 className="text-lg font-bold text-ink mb-2">Runbooks are coming in v2</h3>
        <p className="text-muted">
          A runbook is a named DAG of commands wired by <span className="font-mono">dependsOn</span>.
          Steps stay blocked until their dependencies finish, then run automatically.
          Today you can use Jobs for sequential execution.
        </p>
      </div>

      <div className="bg-surface border border-edge rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <span className="font-ui font-bold text-sm text-ink">What v2 runbooks will include</span>
        </div>
        <div className="divide-y divide-edge">
          {planned.map((item) => (
            <div className="flex items-start gap-3 px-4 py-3" key={item}>
              <span className="flex items-center justify-center w-5 h-5 mt-px flex-shrink-0 text-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <div className="text-sm text-muted">{item}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
