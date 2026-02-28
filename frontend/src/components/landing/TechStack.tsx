import { motion } from "framer-motion";

const technologies = [
  "Node.js",
  "Rust",
  "React",
  "TypeScript",
  "Redis",
  "BullMQ",
  "Socket.io",
  "MongoDB",
  "Tailwind CSS",
  "Framer Motion",
];

export default function TechStack() {
  return (
    <section className="pb-10 overflow-hidden relative border-y border-white/5 bg-black/40 py-12">
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-black to-transparent z-10" />

      <div className="flex">
        <motion.div
          animate={{ x: [0, -1035] }}
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
          className="flex whitespace-nowrap gap-16 px-8 items-center"
        >
          {/* Render the list 3 times to create a seamless infinite loop */}
          {[...technologies, ...technologies, ...technologies].map(
            (tech, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 group cursor-default"
              >
                <span className="text-2xl font-bold text-gray-500/50 group-hover:text-white transition-colors duration-300">
                  {tech}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/30 group-hover:bg-blue-500 transition-colors duration-300" />
              </div>
            ),
          )}
        </motion.div>
      </div>
    </section>
  );
}
