import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useThemeStore } from "../../stores/themeStore";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggle } = useThemeStore();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-100 h-16 flex items-center transition-all ${
        scrolled
          ? "bg-black/[0.72] backdrop-blur-[12px] border-b border-edge"
          : "border-b border-transparent"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-8 w-full flex items-center justify-between">
        <div className="font-semibold text-lg text-ink tracking-tight">Axon</div>
        <div className="hidden sm:flex gap-7">
          <a href="#architecture" className="text-sm text-ink-2 hover:text-ink transition-colors">Architecture</a>
          <a href="#how" className="text-sm text-ink-2 hover:text-ink transition-colors">How it works</a>
                    <a href="#failure" className="text-sm text-ink-2 hover:text-ink transition-colors">Failure modes</a>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center justify-center gap-2 font-medium h-8 px-3 text-xs rounded-sm border border-transparent cursor-pointer transition-all text-ink-2 hover:text-ink"
            onClick={toggle}
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 font-medium h-8 px-3 text-xs rounded-sm border border-transparent cursor-pointer transition-all text-ink-2 hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 font-medium h-8 px-3 text-xs rounded-sm border border-transparent cursor-pointer transition-all bg-primary text-white hover:bg-primary-hover hover:shadow-[0_0_20px_rgba(37,99,235,0.25)]"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
