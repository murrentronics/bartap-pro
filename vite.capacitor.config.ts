import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

const externalSupabaseUrl = "https://vavfsgbrfpvolskscolf.supabase.co";
const externalSupabasePublishableKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhdmZzZ2JyZnB2b2xza3Njb2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODcyNDAsImV4cCI6MjA5Mzk2MzI0MH0.DNNQJ8sHPWljEpYuRoyXtCmR6QCkKmAzfyd08C6kovI";

export default defineConfig(({ mode }) => {
  // Load .env so VITE_APP_VERSION is available at build time
  const env = loadEnv(mode, process.cwd(), "");
  const appVersion = env.VITE_APP_VERSION ?? "1.0.0";

  return {
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  root: ".",
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: path.resolve(__dirname, "index.capacitor.html"),
      output: {
        manualChunks(id) {
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/") || id.includes("node_modules/react-router-dom")) return "vendor-react";
          if (id.includes("node_modules/@supabase")) return "vendor-supabase";
          if (id.includes("node_modules/jspdf")) return "vendor-pdf";
          if (id.includes("node_modules/@radix-ui")) return "vendor-radix";
          if (id.includes("node_modules/@tanstack")) return "vendor-tanstack";
          if (id.includes("node_modules/@capacitor")) return "vendor-capacitor";
        },
      },
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
    },
    outDir: "dist/client",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(externalSupabaseUrl),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("vavfsgbrfpvolskscolf"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(externalSupabasePublishableKey),
    // Bake the current version into the bundle so the update checker works correctly
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  };
});
