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
    <nav className={"top" + (scrolled ? " scrolled" : "")}>
      <div className="wrap">
        <div className="wordmark">Axon</div>
        <div className="navlinks">
          <a href="#architecture">Architecture</a>
          <a href="#how">Docs</a>
          <a href="#architecture">GitHub</a>
          <a href="#failure">Status</a>
        </div>
        <div className="navright">
          <button className="btn btn-ghost btn-sm" onClick={toggle}>{theme === "dark" ? "☀ Light" : "☾ Dark"}</button>
          <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link to="/register" className="btn btn-primary btn-sm">Get started</Link>
        </div>
      </div>
    </nav>
  );
}
