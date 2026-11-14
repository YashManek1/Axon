import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/user":   "http://localhost:3000",
      "/jobs":   "http://localhost:3000",
      "/admin":  "http://localhost:3000",
      "/agents": "http://localhost:3000",
      // /audit was previously missing — added to match auditAPI calls
      "/audit":  "http://localhost:3000",
      // WebSocket proxy for Socket.IO in dev
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom")) {
            return "vendor";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "motion";
          }
          if (id.includes("node_modules/recharts")) {
            return "charts";
          }
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "query";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
          if (id.includes("src/pages/HomePage") || id.includes("src/pages/home-page.css")) {
            return "home-page";
          }
          if (id.includes("src/pages/dashboard/JobDetailPage") || id.includes("src/pages/dashboard/ReconciliationPanel") || id.includes("src/pages/dashboard/SavedRunEvidence")) {
            return "job-detail";
          }
        },
      },
    },
  },
});
