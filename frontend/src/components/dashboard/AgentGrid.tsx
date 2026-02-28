import { useState, useRef, useEffect } from "react";
import {
  Filter,
  Plus,
  MoreVertical,
  RefreshCw,
  Terminal,
  Power,
  Trash2,
  Settings,
  Activity,
  Eye,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { toast } from "../../stores/toastStore";

const cpuData = [
  { v: 35 },
  { v: 42 },
  { v: 38 },
  { v: 44 },
  { v: 40 },
  { v: 42 },
  { v: 45 },
  { v: 43 },
  { v: 42 },
];
const ramData = [
  { v: 62 },
  { v: 65 },
  { v: 64 },
  { v: 67 },
  { v: 68 },
  { v: 66 },
  { v: 69 },
  { v: 70 },
  { v: 68 },
];

const agents = [
  {
    name: "rust-agent-01",
    region: "us-east-1a",
    version: "v2.4.1",
    status: "Online",
    cpu: 42.3,
    ram: 68.7,
    uptime: "23d 14h",
    jobs: "1,247",
    errors: 3,
    network: "842 MB",
  },
  {
    name: "rust-agent-02",
    region: "eu-west-2b",
    version: "v2.4.1",
    status: "Online",
    cpu: 28.6,
    ram: 54.2,
    uptime: "18d 7h",
    jobs: "892",
    errors: 1,
    network: "623 MB",
  },
  {
    name: "rust-agent-03",
    region: "ap-south-1c",
    version: "v2.4.0",
    status: "Online",
    cpu: 71.8,
    ram: 82.4,
    uptime: "31d 2h",
    jobs: "2,134",
    errors: 7,
    network: "1.2 GB",
  },
];

const menuOptions = [
  {
    label: "View Details",
    icon: Eye,
    color: "text-gray-300",
    toastType: "info" as const,
  },
  {
    label: "View Logs",
    icon: Terminal,
    color: "text-gray-300",
    toastType: "info" as const,
  },
  {
    label: "Health Check",
    icon: Activity,
    color: "text-gray-300",
    toastType: "success" as const,
  },
  {
    label: "Restart Agent",
    icon: RefreshCw,
    color: "text-yellow-400",
    toastType: "warning" as const,
  },
  {
    label: "Configure",
    icon: Settings,
    color: "text-gray-300",
    toastType: "info" as const,
  },
  {
    label: "Force Disconnect",
    icon: Power,
    color: "text-orange-400",
    toastType: "warning" as const,
  },
  {
    label: "Remove Agent",
    icon: Trash2,
    color: "text-red-400",
    toastType: "error" as const,
  },
];

function AgentMenu({
  agentName,
  open,
  onClose,
}: {
  agentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 w-52 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg shadow-xl py-1 z-50"
    >
      {menuOptions.map((opt, i) => (
        <button
          key={opt.label}
          onClick={() => {
            onClose();
            toast[opt.toastType](opt.label, `${opt.label} for ${agentName}`);
          }}
          className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-[#23232f] transition-colors ${opt.color} ${i === menuOptions.length - 1 ? "border-t border-[#23232f]" : ""}`}
        >
          <opt.icon className="w-4 h-4" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function AgentGrid() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Agent Grid</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f] transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Deploy Agent
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="bg-[#111118] border border-[#23232f] rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img
                  src="/axon-logo.png"
                  alt="Agent"
                  className="w-10 h-10 rounded-xl object-contain"
                />
                <div>
                  <h3 className="font-semibold text-white">{agent.name}</h3>
                  <p className="text-xs text-gray-400">
                    {agent.region} • {agent.version}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-sm text-emerald-400">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full" />{" "}
                  Status: {agent.status}
                </span>
                <div className="relative">
                  <button
                    aria-label="Agent options"
                    onClick={() =>
                      setOpenMenu(openMenu === agent.name ? null : agent.name)
                    }
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  <AgentMenu
                    agentName={agent.name}
                    open={openMenu === agent.name}
                    onClose={() => setOpenMenu(null)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">CPU Usage</span>
                  <span className="text-emerald-400">{agent.cpu}%</span>
                </div>
                <div className="h-16 bg-[#0a0a0f] rounded-lg overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cpuData}>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">RAM Usage</span>
                  <span className="text-purple-400">{agent.ram}%</span>
                </div>
                <div className="h-16 bg-[#0a0a0f] rounded-lg overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ramData}>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="#a855f7"
                        fill="#a855f7"
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-[#23232f]">
              <div>
                <p className="text-xs text-gray-400">Uptime</p>
                <p className="text-sm font-semibold text-white">
                  {agent.uptime}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Jobs Processed</p>
                <p className="text-sm font-semibold text-white">{agent.jobs}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Errors</p>
                <p className="text-sm font-semibold text-red-400">
                  {agent.errors}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Network I/O</p>
                <p className="text-sm font-semibold text-white">
                  {agent.network}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
