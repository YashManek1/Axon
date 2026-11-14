const reasons = [
  {
    title: "You scaled past 2 servers.",
    body: "Your cron config was written for one machine. It hasn't changed since. Every server that comes up runs every cron job. The question isn't whether you'll have a duplicate execution incident — it's how expensive the one that forces you to fix it will be.",
    tagLabel: "Already happening",
    tagColor: "var(--warning)",
    tagBackground: "rgba(245,158,11,0.1)",
  },
  {
    title: "You have an enterprise customer in your pipeline.",
    body: "They'll ask your security team: 'What access do you have to our servers, and can we review it?' Right now the honest answer is 'SSH with root.' That answer does not close enterprise deals. Axon gives you an answer IT departments cannot reject.",
    tagLabel: "Deal-blocking",
    tagColor: "var(--danger)",
    tagBackground: "rgba(239,68,68,0.1)",
  },
  {
    title: "Your auditor is asking questions.",
    body: "SOC2 Type II requires evidence of who ran each automated process, when, and what it produced. If you can't produce an immutable log for every automation execution, you fail the control. Axon writes that evidence automatically, from the moment you install it.",
    tagLabel: "Compliance",
    tagColor: "var(--info)",
    tagBackground: "rgba(59,130,246,0.1)",
  },
];

export default function WhyNow() {
  return (
    <section className="py-24 border-t border-edge-subtle">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-ink tracking-tight mb-3 leading-tight">
            You've already hit these problems.
            <br />
            Your team just hasn't fixed them yet.
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {reasons.map((reason) => (
            <div className="bg-surface border border-edge rounded-md p-7 flex flex-col" key={reason.title}>
              <h3 className="text-lg font-semibold text-ink mb-3">{reason.title}</h3>
              <p className="text-sm text-ink-2 leading-relaxed mb-4 flex-grow">{reason.body}</p>
              <span
                className="inline-flex font-ui text-xs font-semibold uppercase tracking-wider px-2.25 py-1 rounded-sm w-fit"
                style={{ color: reason.tagColor, background: reason.tagBackground }}
              >
                {reason.tagLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
