function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function HowItWorks() {
  return (
    <section className="py-24 border-t border-edge-subtle" id="how">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-4xl font-bold text-ink tracking-tight mb-3 leading-tight">Up and running in under 5 minutes.</h2>
          <p className="text-base text-ink-2 leading-relaxed">No code changes to your existing jobs. No migration.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          <div className="bg-surface border border-edge rounded-md p-6 flex flex-col">
            <div className="w-9 h-9 flex items-center justify-center border border-edge rounded-sm text-primary mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-ink mb-2">1 · Define what runs</h3>
            <p className="text-sm text-ink-2 leading-relaxed mb-4">Create a job in the dashboard. Name it, write the shell command or HTTP endpoint, set the cron schedule, assign an agent.</p>
            <div className="bg-term-bg border border-edge rounded-sm p-4 font-mono text-xs text-ink-2 leading-relaxed overflow-x-auto mt-auto">
              <span className="text-primary">name</span>{"     "}<span className="text-success">"Nightly DB Backup"</span>{"\n"}
              <span className="text-primary">schedule</span>{" "}<span className="text-success">"0 2 * * *"</span>{"          "}<span className="text-muted"># 2am daily</span>{"\n"}
              <span className="text-primary">command</span>{"  pg_dump prod | gzip > /b.gz\n"}
              <span className="text-primary">agent</span>{"    prod-us-east\n"}
              <span className="text-primary">retries</span>{"  3"}
            </div>
          </div>

          <div className="hidden xl:flex items-center justify-center">
            <div className="text-muted">
              <ArrowIcon />
            </div>
          </div>

          <div className="bg-surface border border-edge rounded-md p-6 flex flex-col xl:col-span-1 md:col-span-2">
            <div className="w-9 h-9 flex items-center justify-center border border-edge rounded-sm text-primary mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="8" rx="2" />
                <rect x="2" y="13" width="20" height="8" rx="2" />
                <path d="M6 7h.01M6 17h.01" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-ink mb-2">2 · Install the agent</h3>
            <p className="text-sm text-ink-2 leading-relaxed mb-4">One binary. Installs as a systemd service on any Linux machine. Dials out over port 443. Reconnects automatically if it drops.</p>
            <div className="bg-term-bg border border-edge rounded-sm p-4 font-mono text-xs text-ink-2 leading-relaxed overflow-x-auto mt-auto">
              <span className="text-info">$</span>{" curl -sSL https://install.axon.run | sh\n\n"}
              <span className="text-muted"># /etc/axon-agent/config.env</span>{"\n"}
              {"SERVER_URL=https://api.axon.run\nAGENT_ID=ag_01HXYZ...\nAGENT_API_KEY=axk_...\n\n"}
              <span className="text-info">$</span>{" systemctl enable --now axon-agent\n"}
              <span className="text-success">●</span>{" axon-agent — active (running)"}
            </div>
          </div>

          <div className="hidden xl:flex items-center justify-center">
            <div className="text-muted">
              <ArrowIcon />
            </div>
          </div>

          <div className="bg-surface border border-edge rounded-md p-6 flex flex-col">
            <div className="w-9 h-9 flex items-center justify-center border border-edge rounded-sm text-primary mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-ink mb-2">3 · Watch it run</h3>
            <p className="text-sm text-ink-2 leading-relaxed mb-4">Every execution streams output live. Every run writes a complete, immutable audit record. Replay any past run at any time.</p>
            <div className="bg-term-bg border border-edge rounded-sm p-4 font-mono text-xs text-ink-2 leading-relaxed overflow-x-auto mt-auto">
              <span className="text-muted">[02:00:00]</span>{" dispatching → prod-us-east\n"}
              <span className="text-muted">[02:00:01]</span>{" pg_dump: connected to \"production\"\n"}
              <span className="text-muted">[02:00:03]</span>{" pg_dump: 2.1M rows · 47 tables\n"}
              <span className="text-muted">[02:00:09]</span>{" gzip: 3.2GB → 820MB\n"}
              <span className="text-muted">[02:00:09]</span>{" "}<span className="text-success">exit 0</span>{" · 9.2s · AuditLog #al_01H..."}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
