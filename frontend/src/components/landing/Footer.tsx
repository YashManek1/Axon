const footerLinks = [
  { label: "Architecture", href: "#architecture" },
  { label: "GitHub",       href: "#architecture" },
  { label: "Docs",         href: "#how" },
  { label: "Status",       href: "#failure" },
  { label: "Changelog",    href: "#" },
];

export default function Footer() {
  return (
    <footer className="landing">
      <div className="wrap">
        <div className="foot-top">
          <div>
            <div className="wordmark" style={{ fontSize: 16 }}>Axon</div>
            <div style={{ fontSize: 14, color: "var(--text-2)", marginTop: 6 }}>Distributed execution control plane.</div>
          </div>
          <div className="foot-links">
            {footerLinks.map((link) => (
              <a key={link.label} href={link.href}>{link.label}</a>
            ))}
          </div>
        </div>
        <div className="foot-bottom">© 2024 Axon. Built for engineers who have been paged at 3am.</div>
      </div>
    </footer>
  );
}
