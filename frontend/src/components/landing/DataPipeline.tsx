export default function DataPipeline() {
  return (
    <section className="py-24 border-t border-edge-subtle" id="data-pipelines">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-4xl font-bold text-ink tracking-tight mb-3 leading-tight">Your jobs already collect data. Give the output somewhere to go.</h2>
          <p className="text-base text-ink-2 leading-relaxed">
            Every execution produces output. Right now that output vanishes into a log file nobody reads,
            a cron email nobody monitors, or a terminal nobody is watching. Axon routes it to your database.
          </p>
        </div>

        {/* ── Incident / Solution card ─────────────────────────────── */}
        <div className="bg-surface border border-edge rounded-md mb-5 relative overflow-hidden grid grid-cols-1 lg:grid-cols-2">
          <div className="p-8 relative z-10 border-l-2 border-danger/30">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-danger/55 mb-3">The Incident</div>
            <div className="text-base font-semibold text-ink mb-3 leading-tight">
              The pipeline lived in someone&apos;s cron. He left. The data stopped. Nobody noticed for 23 days.
            </div>
            <p className="text-sm text-ink-2 leading-relaxed max-w-sm">
              Your growth team needed daily Stripe revenue data in the analytics database. An engineer
              wrote a Python cron: hit the API every morning at 9am, format the JSON, email results to{" "}
              <span className="font-mono">analytics@company.com</span>. When IT cleaned up aliases in a Q3
              sweep, the cron kept firing and the emails kept bouncing. Nobody was subscribed to the
              bounce notifications. The data hadn&apos;t moved in 23 days. Finance caught it four days before
              the board deck was due. Three engineers spent two days reconstructing what the pipeline had
              been silently dropping. The post-mortem had one line: &ldquo;pipeline had no monitoring because
              the pipeline was an email.&rdquo;
            </p>
          </div>

          <div className="p-8 relative z-10 border-l-2 border-primary/30 bg-[rgba(13,24,41,0.4)]">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-primary/60 mb-3">What Axon Does</div>
            <div className="text-base font-semibold text-ink mb-3 leading-tight">
              Configure a sink on any job. Every run&apos;s output lands in your database, retried, audited,
              and encrypted at rest.
            </div>
            <p className="text-sm text-ink-2 leading-relaxed mb-4">
              HTTP jobs capture the API response body. Shell jobs capture stdout. Both are written to
              your MongoDB collection on every run &mdash; tagged with{" "}
              <span className="font-mono">jobId</span>,{" "}
              <span className="font-mono">orgId</span>, and{" "}
              <span className="font-mono">executedAt</span>. If the run fails, BullMQ retries with exponential
              backoff. The audit log records every attempt and its outcome, whether or not anyone is
              watching. Chain jobs with DAG dependencies to build multi-step pipelines: one job fetches
              orders, one fetches returns, a third reconciles both &mdash; each sink writes to a separate
              collection automatically. The pipeline is observable, retried, and does not live in
              anyone&apos;s inbox.
            </p>
            <div className="bg-term-bg border border-edge rounded-sm p-4 font-mono text-xs text-ink-2 leading-relaxed overflow-x-auto mt-4">
              <span className="text-muted">{"// Any job — configure once, runs on schedule"}</span>{"\n"}
              {"{\n "}
              <span className="text-primary">name</span>{": "}<span className="text-success">&quot;Daily Revenue Sync&quot;</span>{",\n "}
              <span className="text-primary">type</span>{": "}<span className="text-success">&quot;http&quot;</span>{",\n "}
              <span className="text-primary">schedule</span>{": "}<span className="text-success">&quot;0 9 * * *&quot;</span>{",\n "}
              <span className="text-primary">payload</span>{": "}{"{ url: "}<span className="text-success">&quot;https://api.stripe.com/v1/charges&quot;</span>{" },\n "}
              <span className="text-primary">sink</span>{": {\n   "}
              <span className="text-primary">databaseName</span>{":\t"}<span className="text-success">&quot;warehouse&quot;</span>{",\n   "}
              <span className="text-primary">collectionName</span>{": "}<span className="text-success">&quot;revenue_daily&quot;</span>{"\n "}{"}\n}"}{"\n\n"}
              <span className="text-muted">{"// warehouse.revenue_daily receives on every run:"}</span>{"\n"}
              {"{ "}<span className="text-primary">jobId</span>{", "}<span className="text-primary">orgId</span>{", "}
              <span className="text-primary">executedAt</span>{": "}<span className="text-success">&quot;2024-03-15T09:00:01Z&quot;</span>{", "}<span className="text-primary">data</span>{": {...} }"}
            </div>
          </div>

          <div className="absolute bottom-[-18px] right-2 text-8xl font-bold text-edge leading-none select-none z-0">05</div>
        </div>

        {/* ── DAG pipeline diagram ─────────────────────────────────── */}
        <div className="bg-surface border border-edge rounded-md p-6 lg:p-8 mt-6">
          <div className="text-center mb-6">
            <div className="font-mono text-xs text-muted uppercase tracking-widest mb-1.5">
              Example: 3-job reconciliation pipeline
            </div>
            <div className="text-sm text-ink-2 mt-1.5">
              Two fetch jobs run in parallel. The reconcile job waits for both. All three sink to your warehouse.
            </div>
          </div>

          <svg
            viewBox="0 0 700 490"
            width="100%"
            style={{ display: "block", overflow: "visible" }}
            aria-label="DAG pipeline diagram: fetch_orders and fetch_returns feed into reconcile, which sinks to Your MongoDB"
          >
            <defs>
              <marker id="dp-ah-blue" viewBox="0 0 10 10" refX="8" refY="5"
                      markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
              </marker>
              <marker id="dp-ah-green" viewBox="0 0 10 10" refX="8" refY="5"
                      markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
              </marker>
            </defs>

            {/* ── fetch_orders ─────────────────────────────────── */}
            <rect x="20" y="20" width="270" height="112" rx="6"
                  fill="#0d1829" stroke="#1a2844" strokeWidth="1" />
            <text x="155" y="50" textAnchor="middle"
                  fill="#e2e8f0" fontWeight="600" fontSize="14"
                  fontFamily="Inter, -apple-system, sans-serif">
              fetch_orders
            </text>
            <text x="155" y="71" textAnchor="middle"
                  fill="#2563eb" fontSize="11"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              type: http · daily 9am
            </text>
            <text x="155" y="91" textAnchor="middle"
                  fill="#94a3b8" fontSize="12"
                  fontFamily="Inter, -apple-system, sans-serif">
              GET api.shopify.com/orders
            </text>
            <line x1="30" y1="103" x2="280" y2="103" stroke="#1a2844" strokeWidth="1" />
            <text x="155" y="121" textAnchor="middle"
                  fill="#10b981" fontSize="11"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              &#x25BA; warehouse.orders_raw
            </text>

            {/* ── fetch_returns ────────────────────────────────── */}
            <rect x="410" y="20" width="270" height="112" rx="6"
                  fill="#0d1829" stroke="#1a2844" strokeWidth="1" />
            <text x="545" y="50" textAnchor="middle"
                  fill="#e2e8f0" fontWeight="600" fontSize="14"
                  fontFamily="Inter, -apple-system, sans-serif">
              fetch_returns
            </text>
            <text x="545" y="71" textAnchor="middle"
                  fill="#2563eb" fontSize="11"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              type: http · daily 9am
            </text>
            <text x="545" y="91" textAnchor="middle"
                  fill="#94a3b8" fontSize="12"
                  fontFamily="Inter, -apple-system, sans-serif">
              GET returns-api.internal/v1
            </text>
            <line x1="420" y1="103" x2="670" y2="103" stroke="#1a2844" strokeWidth="1" />
            <text x="545" y="121" textAnchor="middle"
                  fill="#10b981" fontSize="11"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              &#x25BA; warehouse.returns_raw
            </text>

            {/* ── Bezier arrows: fetch jobs → reconcile ────────── */}
            {/* fetch_orders bottom-center (155, 132) → reconcile top-left (295, 215) */}
            <path d="M 155 132 C 155 188, 295 188, 295 215"
                  fill="none" stroke="#2563eb" strokeWidth="1.5"
                  strokeDasharray="5 3" markerEnd="url(#dp-ah-blue)" />

            {/* fetch_returns bottom-center (545, 132) → reconcile top-right (405, 215) */}
            <path d="M 545 132 C 545 188, 405 188, 405 215"
                  fill="none" stroke="#2563eb" strokeWidth="1.5"
                  strokeDasharray="5 3" markerEnd="url(#dp-ah-blue)" />

            {/* dependsOn label — sits in the gap between the two bezier paths */}
            <text x="350" y="181" textAnchor="middle"
                  fill="#2563eb" fontSize="10" opacity="0.8"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              dependsOn: [fetch_orders, fetch_returns]
            </text>

            {/* ── reconcile ────────────────────────────────────── */}
            <rect x="175" y="215" width="350" height="112" rx="6"
                  fill="#0d1829" stroke="#1a2844" strokeWidth="1" />
            <text x="350" y="246" textAnchor="middle"
                  fill="#e2e8f0" fontWeight="600" fontSize="14"
                  fontFamily="Inter, -apple-system, sans-serif">
              reconcile
            </text>
            <text x="350" y="267" textAnchor="middle"
                  fill="#2563eb" fontSize="11"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              type: shell · dependsOn: 2 jobs
            </text>
            <text x="350" y="287" textAnchor="middle"
                  fill="#94a3b8" fontSize="12"
                  fontFamily="Inter, -apple-system, sans-serif">
              reads orders_raw + returns_raw &#x2192; net revenue
            </text>
            <line x1="185" y1="298" x2="515" y2="298" stroke="#1a2844" strokeWidth="1" />
            <text x="350" y="317" textAnchor="middle"
                  fill="#10b981" fontSize="11"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              &#x25BA; warehouse.net_revenue
            </text>

            {/* ── Vertical arrow: reconcile → MongoDB ──────────── */}
            <line x1="350" y1="327" x2="350" y2="405"
                  stroke="#10b981" strokeWidth="2"
                  markerEnd="url(#dp-ah-green)" />

            {/* Labels on vertical arrow */}
            <text x="361" y="346" fill="#475569" fontSize="10"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              AuditLog written per run
            </text>
            <text x="361" y="362" fill="#475569" fontSize="10"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              BullMQ retry on failure
            </text>
            <text x="361" y="378" fill="#475569" fontSize="10"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              URI encrypted AES-256-GCM
            </text>

            {/* ── Your MongoDB ─────────────────────────────────── */}
            <rect x="120" y="408" width="460" height="76" rx="6"
                  fill="rgba(16,185,129,0.06)"
                  stroke="rgba(16,185,129,0.28)" strokeWidth="1" />
            <text x="350" y="436" textAnchor="middle"
                  fill="#10b981" fontWeight="600" fontSize="14"
                  fontFamily="Inter, -apple-system, sans-serif">
              Your MongoDB
            </text>
            <text x="350" y="455" textAnchor="middle"
                  fill="#10b981" fontSize="10" opacity="0.75"
                  fontFamily="JetBrains Mono, ui-monospace, monospace">
              warehouse database &#xB7; you own it &#xB7; no lock-in
            </text>
            <text x="350" y="473" textAnchor="middle"
                  fill="#94a3b8" fontSize="12"
                  fontFamily="Inter, -apple-system, sans-serif">
              orders_raw &#xB7; returns_raw &#xB7; net_revenue
            </text>
          </svg>
        </div>

        {/* ── Technical facts ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
          {[
            {
              title: "HTTP jobs: API response body",
              body:  "The full response data object lands in your collection. Use it as a pull-based API archiver on any schedule.",
            },
            {
              title: "Shell jobs: stdout captured",
              body:  "Script output is captured and stored. Run any script, capture any transformation result — pipe it directly to your warehouse.",
            },
            {
              title: "URI encrypted at rest",
              body:  "Your sink MongoDB URI is encrypted with AES-256-GCM before being stored. It is never logged in plaintext.",
            },
            {
              title: "Retried + audited per run",
              body:  "BullMQ retries failed runs with exponential backoff. Every attempt — success or failure — is in the immutable audit log.",
            },
          ].map((fact) => (
            <div className="bg-surface border border-edge rounded-md p-4.5" key={fact.title}>
              <div className="font-mono text-sm text-primary mb-2">{fact.title}</div>
              <div className="text-sm text-ink-2 leading-relaxed">{fact.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}