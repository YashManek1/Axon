import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Navbar />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
