import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const initialLogs = [
  {
    id: 1,
    text: "[SYSTEM] Axon Control Plane initialized...",
    type: "info",
    delay: 0,
  },
  {
    id: 2,
    text: "[DISCOVERY] Agent rust-agent-01 (192.168.1.10) registered",
    type: "success",
    delay: 800,
  },
  {
    id: 3,
    text: "[DISCOVERY] Agent rust-agent-02 (us-east-2) registered",
    type: "success",
    delay: 1500,
  },
  {
    id: 4,
    text: "[QUEUE] Job data-sync-db-77 queued for execution",
    type: "info",
    delay: 2400,
  },
];

const dynamicLogs = [
  { text: "[EXECUTION] rust-agent-01 started data-sync-db-77", type: "info" },
  { text: "[METRIC] CPU jump detected on rust-agent-02: 84%", type: "warning" },
  {
    text: "[SUCCESS] rust-agent-01 completed data-sync-db-77 in 120ms",
    type: "success",
  },
  {
    text: "[ERROR] Webhook dispatch timeout on endpoint /api/sink",
    type: "error",
  },
  {
    text: "[RETRY] BullMQ retrying webhook dispatch (Attempt 2/5)",
    type: "warning",
  },
  { text: "[SUCCESS] Webhook dispatch completed via retry", type: "success" },
];

export default function Terminal() {
  const [logs, setLogs] = useState(initialLogs);

  useEffect(() => {
    // Add dynamic logs slowly
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < dynamicLogs.length) {
        setLogs((prev) => [
          ...prev.slice(-7),
          {
            id: Date.now(),
            ...dynamicLogs[currentIndex],
            delay: 0,
          },
        ]);
        currentIndex++;
      } else {
        currentIndex = 0; // Loop the dynamic logs for visual effect
      }
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const getColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-emerald-400";
      case "warning":
        return "text-yellow-400";
      case "error":
        return "text-red-400";
      default:
        return "text-blue-400";
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="max-w-4xl mx-auto"
    >
      <div className="flex flex-col rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl">
        {/* Terminal Header */}
        <div className="flex items-center px-4 py-3 bg-[#111118] border-b border-white/10">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <p className="ml-4 text-xs text-gray-400 font-mono">
            axon-control-plane ~ tail -f /var/log/axon.log
          </p>
        </div>

        {/* Terminal Body */}
        <div className="p-6 h-[300px] overflow-y-auto font-mono text-sm sm:text-base leading-relaxed flex flex-col justify-end">
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-2 flex items-start"
              >
                <span className="text-gray-500 mr-3 shrink-0">
                  {new Date().toISOString().split("T")[1].slice(0, 8)}
                </span>
                <span className={`${getColor(log.type)} break-all`}>
                  {log.text}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {/* Blinking Cursor */}
          <div className="mt-2 flex items-center h-6">
            <span className="text-gray-500 mr-3 shrink-0">
              {new Date().toISOString().split("T")[1].slice(0, 8)}
            </span>
            <motion.div
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="w-2.5 h-5 bg-white/70"
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
