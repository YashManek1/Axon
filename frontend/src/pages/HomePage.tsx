import Hero from "../components/landing/Hero";
import BentoGrid from "../components/landing/BentoGrid";
import Terminal from "../components/landing/Terminal";
import TechStack from "../components/landing/TechStack";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/30 overflow-hidden">
      {/* Background Glow Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full" />
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        <Hero />
        <div className="max-w-7xl mx-auto px-6 py-24 space-y-32">
          <BentoGrid />
          <Terminal />
          <TechStack />
        </div>
      </div>
    </div>
  );
}
