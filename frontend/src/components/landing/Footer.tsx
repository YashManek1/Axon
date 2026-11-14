const footerLinks = [
  { label: "Architecture", href: "#architecture" },
  { label: "GitHub",       href: "#architecture" },
  { label: "Docs",         href: "#how" },
  { label: "Status",       href: "#failure" },
  { label: "Changelog",    href: "#" },
];

export default function Footer() {
  return (
    <footer className="border-t border-edge py-12 lg:py-16">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="flex justify-between items-start gap-8 flex-wrap mb-8">
          <div>
            <div className="font-semibold text-base text-ink tracking-tight">Axon</div>
            <div className="text-sm text-ink-2 mt-1.5">Distributed execution control plane.</div>
          </div>
          <div className="flex gap-6 flex-wrap">
            {footerLinks.map((link) => (
              <a key={link.label} href={link.href} className="text-sm text-ink-2 hover:text-ink transition-colors">
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="text-xs text-disabled">© 2026 Axon. Built for engineers who have been paged at 3am.</div>
      </div>
    </footer>
  );
}
