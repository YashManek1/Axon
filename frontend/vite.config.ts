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
      "/user": "http://localhost:3000",
      "/jobs": "http://localhost:3000",
      "/admin": "http://localhost:3000",
      "/agents": "http://localhost:3000",
    },
  },
});
