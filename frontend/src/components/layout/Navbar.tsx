import { Search, Bell, Settings, ChevronDown, LogOut } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="bg-[#111118] border-b border-[#23232f] sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img
              src="/axon-logo.png"
              alt="Axon Logo"
              className="w-9 h-9 rounded-lg object-contain"
            />
            <span className="text-xl font-bold text-white">Axon</span>
          </div>

          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search agents, jobs, logs..."
                className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#3a3a4a] transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              aria-label="Notifications"
              className="relative p-2 text-gray-400 hover:text-white hover:bg-[#1a1a24] rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <button
              aria-label="Settings"
              className="p-2 text-gray-400 hover:text-white hover:bg-[#1a1a24] rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                aria-label="User menu"
                className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-[#1a1a24] transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user?.username?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-white">
                    {user?.username || "User"}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">
                    {user?.role || "user"}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg shadow-xl py-1 z-50">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-[#23232f] transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
