import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import ProblemStrip from "../components/landing/ProblemStrip";
import FourProblems from "../components/landing/FourProblems";
import HowItWorks from "../components/landing/HowItWorks";
import DataPipeline from "../components/landing/DataPipeline";
import Architecture from "../components/landing/Architecture";
import WhyNow from "../components/landing/WhyNow";
import FailureModes from "../components/landing/FailureModes";
import AuditDemo from "../components/landing/AuditDemo";
import Pricing from "../components/landing/Pricing";
import Footer from "../components/landing/Footer";

export default function HomePage() {
  return (
    <div
      className="bg-bg"
      style={{
        backgroundImage:
          "linear-gradient(rgba(26,40,68,0.30) 1px, transparent 1px), linear-gradient(90deg, rgba(26,40,68,0.30) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <Navbar />
      <Hero />
      <ProblemStrip />
      <FourProblems />
      <DataPipeline />
      <HowItWorks />
      <Architecture />
      <WhyNow />
      <FailureModes />
      <AuditDemo />
      <Pricing />
      <Footer />
    </div>
  );
}
