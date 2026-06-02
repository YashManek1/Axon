import { Fragment, useState } from "react";

const auditRows = [
  { id: "r1", timestamp: "2024-03-15 02:00", job: "Nightly DB Backup", trigger: "SCHEDULED", agent: "prod-us-east", statusClass: "completed", statusLabel: "Completed", duration: "9.2s",  exitCode: 0,  exitColor: "var(--success)", expandable: false },
  { id: "r2", timestamp: "2024-03-14 14:32", job: "Restart API",        trigger: "MANUAL_UI",  agent: "prod-us-east", statusClass: "completed", statusLabel: "Completed", duration: "0.8s",  exitCode: 0,  exitColor: "var(--success)", expandable: true  },
  { id: "r3", timestamp: "2024-03-14 09:15", job: "Health Check",       trigger: "SCHEDULED",  agent: "prod-eu-west", statusClass: "failed",    statusLabel: "Failed",    duration: "30.0s", exitCode: -1, exitColor: "var(--danger)",  expandable: false },
  { id: "r4", timestamp: "2024-03-14 09:15", job: "Health Check",       trigger: "RETRY",      agent: "prod-eu-west", statusClass: "completed", statusLabel: "Completed", duration: "1.1s",  exitCode: 0,  exitColor: "var(--success)", expandable: false },
  { id: "r5", timestamp: "2024-03-13 23:00", job: "Data Export",        trigger: "SCHEDULED",  agent: "customer-A",   statusClass: "timeout",   statusLabel: "Timeout",   duration: "30.0s", exitCode: -1, exitColor: "var(--danger)",  expandable: false },
];

export default function AuditDemo() {
  const [expandedRow, setExpandedRow] = useState(false);

  return (
    <section className="band">
      <div className="wrap">
        <div className="sec-head">
          <h2>Every execution. On record. Permanently.</h2>
          <p>These fields cannot be edited after they are written. Not by engineers. Not by admins. Your auditor will ask for this.</p>
        </div>
        <div className="auditwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Job</th>
                <th>Trigger</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Dur</th>
                <th>Exit</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    style={{ cursor: row.expandable ? "pointer" : undefined }}
                    onClick={row.expandable ? () => setExpandedRow((prev) => !prev) : undefined}
                  >
                    <td className="mono" style={{ fontSize: 13 }}>{row.timestamp}</td>
                    <td style={{ color: "var(--text)" }}>{row.job}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{row.trigger}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{row.agent}</td>
                    <td><span className={"badge " + row.statusClass}>{row.statusLabel}</span></td>
                    <td className="mono num">{row.duration}</td>
                    <td className="mono" style={{ color: row.exitColor }}>{row.exitCode}</td>
                  </tr>
                  {row.expandable && expandedRow && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, height: "auto" }}>
                        <div className="expand-detail">
                          <div className="dl">
                            <span className="dk">command</span>
                            <span className="dv">systemctl restart axon-api</span>
                            <span className="dk">triggered by</span>
                            <span className="dv">alice@example.com from 203.0.113.45</span>
                            <span className="dk">stdout</span>
                            <span className="dv" style={{ color: "var(--success)" }}>● axon-api.service restarted successfully</span>
                            <span className="dk">result</span>
                            <span className="dv">
                              <span style={{ color: "var(--success)" }}>exit 0</span>
                              {" · 0.8s · AuditLog #al_01HG9K... "}
                              <span style={{ color: "var(--muted)" }}>(immutable)</span>
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
