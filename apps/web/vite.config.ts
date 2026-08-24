import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base` is "/" for the nginx-served prod build (assets under the domain root)
// but must be "./" when the desktop app loads the bundle over file:// — an
// absolute "/assets/..." resolves to the filesystem root there and renders a
// blank window. The desktop build sets VITE_BASE=./ for its own web bundle.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
});
