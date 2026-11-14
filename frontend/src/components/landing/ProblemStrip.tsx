const stats = [
  { value: "$12,400", color: "var(--danger)",  label: "one duplicate cron run" },
  { value: "3 weeks", color: "var(--warning)", label: "average time to get a firewall exception" },
  { value: "0 answers", color: "var(--danger)", label: "when the auditor asks who ran it" },
  { value: "9 changes", color: "var(--danger)", label: "from one SSH session to fix one thing" },
];

export default function ProblemStrip() {
  return (
    <section className="pb-6">
      <div className="max-w-[1200px] mx-auto px-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div className="bg-surface border border-edge rounded-md p-5.5" key={stat.label}>
            <div className="text-2xl font-bold tabular-nums tracking-tight mb-1.5" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-sm text-label leading-tight">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
