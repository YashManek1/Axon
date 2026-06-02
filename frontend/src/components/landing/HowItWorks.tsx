function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function HowItWorks() {
  return (
    <section className="band" id="how">
      <div className="wrap">
        <div className="sec-head">
          <h2>Up and running in under 5 minutes.</h2>
          <p>No code changes to your existing jobs. No migration.</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <h3>1 · Define what runs</h3>
            <p>Create a job in the dashboard. Name it, write the shell command or HTTP endpoint, set the cron schedule, assign an agent.</p>
            <div className="code">
              <span className="c-key">name</span>{"     "}<span className="c-str">"Nightly DB Backup"</span>{"\n"}
              <span className="c-key">schedule</span>{" "}<span className="c-str">"0 2 * * *"</span>{"          "}<span className="c-comment"># 2am daily</span>{"\n"}
              <span className="c-key">command</span>{"  pg_dump prod | gzip > /b.gz\n"}
              <span className="c-key">agent</span>{"    prod-us-east\n"}
              <span className="c-key">retries</span>{"  3"}
            </div>
          </div>

          <div className="arrow"><ArrowIcon /></div>

          <div className="step">
            <div className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="8" rx="2" />
                <rect x="2" y="13" width="20" height="8" rx="2" />
                <path d="M6 7h.01M6 17h.01" />
              </svg>
            </div>
            <h3>2 · Install the agent</h3>
            <p>One binary. Installs as a systemd service on any Linux machine. Dials out over port 443. Reconnects automatically if it drops.</p>
            <div className="code">
              <span className="c-prompt">$</span>{" curl -sSL https://install.axon.run | sh\n\n"}
              <span className="c-comment"># /etc/axon-agent/config.env</span>{"\n"}
              {"SERVER_URL=https://api.axon.run\nAGENT_ID=ag_01HXYZ...\nAGENT_API_KEY=axk_...\n\n"}
              <span className="c-prompt">$</span>{" systemctl enable --now axon-agent\n"}
              <span className="c-ok">●</span>{" axon-agent — active (running)"}
            </div>
          </div>

          <div className="arrow"><ArrowIcon /></div>

          <div className="step">
            <div className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h3>3 · Watch it run</h3>
            <p>Every execution streams output live. Every run writes a complete, immutable audit record. Replay any past run at any time.</p>
            <div className="code">
              <span className="c-comment">[02:00:00]</span>{" dispatching → prod-us-east\n"}
              <span className="c-comment">[02:00:01]</span>{" pg_dump: connected to \"production\"\n"}
              <span className="c-comment">[02:00:03]</span>{" pg_dump: 2.1M rows · 47 tables\n"}
              <span className="c-comment">[02:00:09]</span>{" gzip: 3.2GB → 820MB\n"}
              <span className="c-comment">[02:00:09]</span>{" "}<span className="c-ok">exit 0</span>{" · 9.2s · AuditLog #al_01H..."}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
