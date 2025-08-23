import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: set base to your repo name
export default defineConfig({
  plugins: [react()],
  base: "/seating-chart/"
});
