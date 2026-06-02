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
      <div className="page-head">
        <div>
          <h1>Runbooks</h1>
          <p>Pre-approved command graphs with dependency-aware execution</p>
        </div>
      </div>

      <div className="panel empty" style={{ padding: "64px 24px" }}>
        <div className="ic"><BookOpen size={22} /></div>
        <h3>Runbooks are coming in v2</h3>
        <p>
          A runbook is a named DAG of commands wired by <span className="mono">dependsOn</span>.
          Steps stay blocked until their dependencies finish, then run automatically.
          Today you can use Jobs for sequential execution.
        </p>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><span className="panel-title">What v2 runbooks will include</span></div>
        <div className="feed">
          {planned.map((item) => (
            <div className="feed-item" key={item}>
              <span className="ic acc">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <div className="bd"><div className="t">{item}</div></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
