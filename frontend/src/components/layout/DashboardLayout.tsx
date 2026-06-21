import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Activity, Server, Play, BookOpen, FileText, Terminal,
  Search, Bell, Sun, Moon, Menu, LogOut, ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { authAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

function buildNavGroups(isAdmin: boolean): { label: string | null; items: NavItem[] }[] {
  const groups: { label: string | null; items: NavItem[] }[] = [
    {
      label: null,
      items: [{ path: "/dashboard/overview", label: "Overview", icon: <Activity size={16} /> }],
    },
    {
      label: "Fleet",
      items: [
        { path: "/dashboard/agents",   label: "Agents",   icon: <Server   size={16} /> },
        { path: "/dashboard/jobs",     label: "Jobs",     icon: <Play     size={16} /> },
        { path: "/dashboard/runbooks", label: "Runbooks", icon: <BookOpen size={16} /> },
      ],
    },
    {
      label: "Records",
      items: [
        { path: "/dashboard/audit", label: "Audit Log", icon: <FileText size={16} /> },
        { path: "/dashboard/live",  label: "Live",      icon: <Terminal size={16} /> },
      ],
    },
  ];

  if (isAdmin) {
    groups.push({
      label: "Admin",
      items: [{ path: "/dashboard/admin", label: "Analytics", icon: <ShieldCheck size={16} /> }],
    });
  }

  return groups;
}

const pageTitles: Record<string, string> = {
  overview: "Overview",
  agents:   "Agents",
  jobs:     "Jobs",
  runbooks: "Runbooks",
  audit:    "Audit Log",
  live:     "Live",
  admin:    "Admin Analytics",
};

export default function DashboardLayout() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout }   = useAuthStore();
  const { theme, toggle }  = useThemeStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const segment    = location.pathname.split("/")[2] || "overview";
  const navGroups  = buildNavGroups(user?.role === "admin");
  const pageTitle = pageTitles[segment] || "Dashboard";
  const initials  = user?.username ? user.username.slice(0, 2).toUpperCase() : "AX";

  const handleLogout = async () => {
    await authAPI.logout().catch(() => undefined);
    logout();
    toast.info("Signed Out", "You have been signed out");
    navigate("/login");
  };

  return (
    <div className="app">
      {sidebarOpen && (
        <div className="scrim show" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={"side" + (sidebarOpen ? " open" : "")}>
        <div className="side-head">
          <div className="org-switch">
            <span className="av">{initials[0]}</span>
            <span>
              <span className="nm">{user?.username || "Axon"}</span>
              <span className="sub">control plane</span>
            </span>
          </div>
        </div>

        <nav className="side-nav">
          {navGroups.map((group) => (
            <div key={group.label ?? "_top"}>
              {group.label && <div className="nav-group">{group.label}</div>}
              {group.items.map((item) => {
                const active = location.pathname.startsWith(item.path);
                return (
                  <button
                    key={item.path}
                    className={"nav-item" + (active ? " active" : "")}
                    onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div
            className="row gap-2"
            style={{ padding: "0 2px 10px", fontSize: "var(--t-xs)", color: "var(--text-faint)" }}
          >
            <span className="live-dot" />
            <span className="mono">control plane · v1</span>
          </div>
          <div className="user-chip" onClick={handleLogout} title="Sign out">
            <span className="av">{initials}</span>
            <span style={{ flex: 1 }}>
              <span className="nm">{user?.username}</span>
              <span className="sub">{user?.role}</span>
            </span>
            <LogOut size={14} style={{ color: "var(--text-faint)" }} />
          </div>
        </div>
      </aside>

      <div className="app-main">
        <div className="topbar">
          <button
            className="btn btn-ghost btn-sm menu-btn"
            style={{ display: "none" }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          <div className="crumb">
            <span className="root">Axon</span>
            <span className="sep">/</span>
            <span className="here">{pageTitle}</span>
          </div>

          <span className="grow" />

          <div className="searchbar">
            <Search size={14} />
            <span>Search agents, jobs, audit…</span>
            <span className="grow" />
            <span className="kbd">⌘K</span>
          </div>

          <div className="health">
            <span className="live-dot" />
            operational
          </div>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => toast.info("Notifications", "No new notifications")}
          >
            <Bell size={16} />
          </button>

          <button className="btn btn-ghost btn-sm" onClick={toggle}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
