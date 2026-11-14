import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Activity, Server, Play, BookOpen, FileText, Terminal,
  Sun, Moon, Menu, LogOut, ShieldCheck, Settings,
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { authAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import AxonBrand from "../brand/AxonBrand";

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
        { path: "/dashboard/agents",   label: "Servers",    icon: <Server   size={16} /> },
        { path: "/dashboard/jobs",     label: "Operations", icon: <Play     size={16} /> },
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
      items: [
        { path: "/dashboard/admin",    label: "Analytics", icon: <ShieldCheck size={16} /> },
        { path: "/dashboard/settings", label: "Settings",  icon: <Settings    size={16} /> },
      ],
    });
  }

  return groups;
}

const pageTitles: Record<string, string> = {
  overview: "Overview",
  agents:   "Servers",
  jobs:     "Operations",
  runbooks: "Runbooks",
  audit:    "Audit Log",
  live:     "Live",
  admin:    "Admin Analytics",
  settings: "Settings",
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
    <div className="flex min-h-screen bg-bg">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-55 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`w-58 border-r border-edge bg-surface flex flex-col fixed left-0 top-0 h-screen transition-transform lg:relative lg:sticky lg:w-58 lg:shrink-0 z-60 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="px-4 pt-4 pb-3.5 border-b border-edge flex items-center gap-2.5">
          <div className="flex items-center gap-2 flex-1 px-2 py-1.75 rounded-sm border border-edge bg-surface-2">
            <span className="w-6 h-6 rounded bg-primary flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {initials[0]}
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-semibold leading-tight text-ink truncate">{user?.username || "Axon"}</span>
              <span className="text-xs text-label">control plane</span>
            </span>
          </div>
        </div>

        <nav className="px-2.5 py-2.5 flex flex-col gap-px flex-1 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label ?? "_top"}>
              {group.label && (
                <div className="px-2.5 pt-3 pb-1.25 font-mono text-xs font-semibold tracking-widest uppercase text-muted">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const active = location.pathname.startsWith(item.path);
                return (
                  <button
                    key={item.path}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-sm font-medium transition-colors border-none bg-transparent w-full text-left ${
                      active
                        ? "bg-accent/10 text-primary"
                        : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                    }`}
                  onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                  aria-current={active ? "page" : undefined}
                  >
                    <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto px-3 pb-3 border-t border-edge">
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center gap-2.5 px-2 py-1.75 rounded-sm transition-colors cursor-pointer hover:bg-surface-2 w-full"
          >
            <span className="w-7 h-7 rounded-full bg-surface-2 border border-strong flex items-center justify-center text-xs font-semibold flex-shrink-0 text-ink">
              {initials}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium leading-tight text-ink truncate">{user?.username}</span>
              <span className="block text-xs text-muted">{user?.role}</span>
            </span>
            <LogOut size={14} className="text-muted flex-shrink-0" />
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="sticky top-0 z-20 flex items-center gap-3.5 px-5.5 h-14 border-b border-edge bg-opacity-88 backdrop-blur">
          <button
            className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-sm text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center gap-2 text-sm min-w-0">
            <AxonBrand className="hidden xs:inline-flex text-ink-2" />
            <span className="text-muted hidden xs:inline">/</span>
            <span className="font-semibold text-ink truncate">{pageTitle}</span>
          </div>

          <span className="flex-1" />

          <button
            className="inline-flex items-center justify-center w-8 h-8 rounded-sm text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggle}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="flex-1 px-5.5 py-6 max-w-5xl w-full">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
