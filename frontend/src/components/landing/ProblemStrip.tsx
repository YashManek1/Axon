const stats = [
  { value: "$12,400", color: "var(--danger)",  label: "one duplicate cron run" },
  { value: "3 weeks", color: "var(--warning)", label: "average time to get a firewall exception" },
  { value: "0 answers", color: "var(--danger)", label: "when the auditor asks who ran it" },
  { value: "9 changes", color: "var(--danger)", label: "from one SSH session to fix one thing" },
];

export default function ProblemStrip() {
  return (
    <section style={{ paddingBottom: 24 }}>
      <div className="wrap stripgrid">
        {stats.map((stat) => (
          <div className="statcard" key={stat.label}>
            <div className="big" style={{ color: stat.color }}>{stat.value}</div>
            <div className="lab">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
