export default function DataPipeline() {
  return (
    <section className="band" id="data-pipelines">
      <div className="wrap">
        <div className="sec-head">
          <h2>Your jobs already collect data. Give the output somewhere to go.</h2>
          <p>
            Every execution produces output. Right now that output vanishes into a log file nobody reads,
            a cron email nobody monitors, or a terminal nobody is watching. Axon routes it to your database.
          </p>
        </div>

        {/* ── Incident / Solution card ─────────────────────────────── */}
        <div className="problem">
          <div className="half incident">
            <div className="eyebrow lab-incident">The Incident</div>
            <div className="phead">
              The pipeline lived in someone&apos;s cron. He left. The data stopped. Nobody noticed for 23 days.
            </div>
            <p className="pbody" style={{ maxWidth: 460 }}>
              Your growth team needed daily Stripe revenue data in the analytics database. An engineer
              wrote a Python cron: hit the API every morning at 9am, format the JSON, email results to{" "}
              <span className="mono">analytics@company.com</span>. When IT cleaned up aliases in a Q3
              sweep, the cron kept firing and the emails kept bouncing. Nobody was subscribed to the
              bounce notifications. The data hadn&apos;t moved in 23 days. Finance caught it four days before
              the board deck was due. Three engineers spent two days reconstructing what the pipeline had
              been silently dropping. The post-mortem had one line: &ldquo;pipeline had no monitoring because
              the pipeline was an email.&rdquo;
            </p>
          </div>

          <div className="half solution">
            <div className="eyebrow lab-solution">What Axon Does</div>
            <div className="phead">
              Configure a sink on any job. Every run&apos;s output lands in your database, retried, audited,
              and encrypted at rest.
            </div>
            <p className="pbody">
              HTTP jobs capture the API response body. Shell jobs capture stdout. Both are written to
              your MongoDB collection on every run &mdash; tagged with{" "}
              <span className="mono">jobId</span>,{" "}
              <span className="mono">orgId</span>, and{" "}
              <span className="mono">executedAt</span>. If the run fails, BullMQ retries with exponential
              backoff. The audit log records every attempt and its outcome, whether or not anyone is
              watching. Chain jobs with DAG dependencies to build multi-step pipelines: one job fetches
              orders, one fetches returns, a third reconciles both &mdash; each sink writes to a separate
              collection automatically. The pipeline is observable, retried, and does not live in
              anyone&apos;s inbox.
            </p>
            <div className="code" style={{ fontSize: 11, marginTop: 16 }}>
              <span className="c-comment">{"// Any job — configure once, runs on schedule"}</span>{"\n"}
              {"{\n "}
              <span className="c-key">name</span>{": "}<span className="c-str">&quot;Daily Revenue Sync&quot;</span>{",\n "}
              <span className="c-key">type</span>{": "}<span className="c-str">&quot;http&quot;</span>{",\n "}
              <span className="c-key">schedule</span>{": "}<span className="c-str">&quot;0 9 * * *&quot;</span>{",\n "}
              <span className="c-key">payload</span>{": "}{"{ url: "}<span className="c-str">&quot;https://api.stripe.com/v1/charges&quot;</span>{" },\n "}
              <span className="c-key">sink</span>{": {\n   "}
              <span className="c-key">databaseName</span>{":\t"}<span className="c-str">&quot;warehouse&quot;</span>{",\n   "}
              <span className="c-key">collectionName</span>{": "}<span className="c-str">&quot;revenue_daily&quot;</span>{"\n "}{"}\n}"}{"\n\n"}
              <span className="c-comment">{"// warehouse.revenue_daily receives on every run:"}</span>{"\n"}
              {"{ "}<span className="c-key">jobId</span>{", "}<span className="c-key">orgId</span>{", "}
              <span className="c-key">executedAt</span>{": "}<span className="c-str">&quot;2024-03-15T09:00:01Z&quot;</span>{", "}<span className="c-key">data</span>{": {...} }"}
            </div>
          </div>

          <div className="pnum" aria-hidden="true">05</div>
        </div>

        {/* ── DAG pipeline diagram ─────────────────────────────────── */}
        <div className="arch" style={{ marginTop: 24, padding: "32px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase" }}>
              Example: 3-job reconciliation pipeline
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 6 }}>
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
        <div className="factgrid" style={{ marginTop: 24 }}>
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
            <div className="fact" key={fact.title}>
              <div className="ft">{fact.title}</div>
              <div className="fb">{fact.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}