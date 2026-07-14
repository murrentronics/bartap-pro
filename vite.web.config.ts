/**
 * Web build config — for bartendazpro-web.pages.dev
 * This is a plain React SPA (no Capacitor, no native plugins).
 * Deploy the dist/web folder to a separate Cloudflare Pages project.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

const externalSupabaseUrl = "https://vavfsgbrfpvolskscolf.supabase.co";
const externalSupabasePublishableKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhdmZzZ2JyZnB2b2xza3Njb2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODcyNDAsImV4cCI6MjA5Mzk2MzI0MH0.DNNQJ8sHPWljEpYuRoyXtCmR6QCkKmAzfyd08C6kovI";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  root: ".",
  publicDir: "public-web",
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: path.resolve(__dirname, "index.web.html"),
      output: {
        manualChunks(id) {
          if (id.includes("lucide-react"))                                           return "vendor-icons";
          if (id.includes("node_modules/react-dom") ||
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-router-dom"))                          return "vendor-react";
          if (id.includes("node_modules/@supabase"))                                return "vendor-supabase";
          if (id.includes("node_modules/jspdf"))                                    return "vendor-pdf";
          if (id.includes("node_modules/@radix-ui"))                               return "vendor-radix";
          if (id.includes("node_modules/@tanstack"))                               return "vendor-tanstack";
        },
      },
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
    },
    outDir: "dist/web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub out all Capacitor modules so they don't break the web build
      "@capacitor/core":                   path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor/push-notifications":     path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor/local-notifications":    path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor/filesystem":             path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor/clipboard":              path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor/share":                  path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor/camera":                 path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor/browser":                path.resolve(__dirname, "src/stubs/capacitor.ts"),
      "@capacitor-community/file-opener":  path.resolve(__dirname, "src/stubs/capacitor.ts"),
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL":              JSON.stringify(externalSupabaseUrl),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID":       JSON.stringify("vavfsgbrfpvolskscolf"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY":  JSON.stringify(externalSupabasePublishableKey),
    "import.meta.env.VITE_APP_VERSION":               JSON.stringify("web"),
  },
});
