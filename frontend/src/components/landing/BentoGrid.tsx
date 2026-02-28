import { motion } from "framer-motion";
import { Activity, ShieldCheck, Cpu, Database } from "lucide-react";

export default function BentoGrid() {
  const containerVars = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVars = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  return (
    <motion.section
      variants={containerVars}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className="grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {/* Card 1: Telemetry (Col Span 2) */}
      <motion.div
        variants={itemVars}
        whileHover={{ y: -5 }}
        className="md:col-span-2 bg-[#111118]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6 border border-blue-500/20">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Real-time Telemetry
            </h3>
            <p className="text-gray-400 max-w-md">
              Monitor sub-second CPU, Memory, and Network I/O metrics across
              your entire fleet, securely streamed via WebSockets.
            </p>
          </div>

          <div className="mt-8 h-24 flex items-end gap-2 opacity-70">
            {/* Mock SVG Sparkline Animation */}
            <svg
              viewBox="0 0 100 30"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M 0 30 L 10 25 L 20 28 L 30 15 L 40 20 L 50 10 L 60 18 L 70 8 L 80 12 L 90 5 L 100 10"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 2, ease: "easeInOut" }}
              />
            </svg>
          </div>
        </div>
      </motion.div>

      {/* Card 2: Rust Agents */}
      <motion.div
        variants={itemVars}
        whileHover={{ y: -5 }}
        className="bg-[#111118]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-bl from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-6 border border-orange-500/20">
            <Cpu className="w-6 h-6 text-orange-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Rust Native Agents
          </h3>
          <p className="text-gray-400 text-sm">
            Ultra-lightweight binaries forged in Rust. Zero dependencies. Memory
            safe. Executes on Windows, Linux, or macOS with native speed.
          </p>
        </div>
      </motion.div>

      {/* Card 3: Data Vault */}
      <motion.div
        variants={itemVars}
        whileHover={{ y: -5 }}
        className="bg-[#111118]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Secure Data Vault
          </h3>
          <p className="text-gray-400 text-sm">
            End-to-end encrypted ETL pipelines. AES-256-CBC securing your
            MongoDB sinks, ensuring credentials never touch the wire in
            plaintext.
          </p>
        </div>
      </motion.div>

      {/* Card 4: The Brain (Col Span 2) */}
      <motion.div
        variants={itemVars}
        whileHover={{ y: -5 }}
        className="md:col-span-2 bg-[#111118]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20">
              <Database className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">The Brain</h3>
            <p className="text-gray-400">
              A fault-tolerant control plane powered by Node.js, BullMQ, and
              Redis. Handles job scheduling, retries, concurrency limits, and
              webhook dispatching with zero data loss.
            </p>
          </div>
          <div className="w-full md:w-1/3 aspect-video rounded-lg bg-[#0a0a0f] border border-white/5 flex items-center justify-center relative">
            {/* Visual representation of queues */}
            <div className="flex flex-col gap-2 w-3/4">
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ repeat: Infinity, repeatDelay: 2, duration: 0.5 }}
                className="h-2 w-full bg-blue-500/50 rounded-full"
              />
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{
                  repeat: Infinity,
                  repeatDelay: 2,
                  duration: 0.5,
                  delay: 0.1,
                }}
                className="h-2 w-3/4 bg-purple-500/50 rounded-full"
              />
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{
                  repeat: Infinity,
                  repeatDelay: 2,
                  duration: 0.5,
                  delay: 0.2,
                }}
                className="h-2 w-5/6 bg-emerald-500/50 rounded-full"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
}
