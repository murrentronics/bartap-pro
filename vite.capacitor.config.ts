// Capacitor/Android SPA build — no SSR, no Cloudflare Workers.
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";
import fs from "fs";

const externalSupabaseUrl = "https://vavfsgbrfpvolskscolf.supabase.co";
const externalSupabasePublishableKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhdmZzZ2JyZnB2b2xza3Njb2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODcyNDAsImV4cCI6MjA5Mzk2MzI0MH0.DNNQJ8sHPWljEpYuRoyXtCmR6QCkKmAzfyd08C6kovI";

// Plugin that stubs out all TanStack Start server-only modules
function stubServerModules(): Plugin {
  const STUB_IDS = [
    "@tanstack/react-start",
    "@tanstack/react-start/server",
    "@tanstack/start-server-core",
  ];

  const STUB_CODE: Record<string, string> = {
    "@tanstack/react-start": `
      export const useServerFn = (fn) => fn;
      export const createServerFn = () => {
        const fn = () => () => Promise.resolve(null);
        fn.middleware = () => fn;
        fn.validator = () => fn;
        fn.handler = (h) => h;
        fn.server = (h) => fn;
        fn.client = (h) => fn;
        return fn;
      };
      export const createMiddleware = () => {
        const m = {};
        m.middleware = () => m;
        m.server = () => m;
        m.client = () => m;
        return m;
      };
      export default {};
    `,
    "@tanstack/react-start/server": `
      export const getRequest = () => null;
      export const getEvent = () => null;
      export const getHeaders = () => ({});
      export const setHeader = () => {};
      export default {};
    `,
    "@tanstack/start-server-core": `export default {};`,
  };

  return {
    name: "stub-server-modules",
    enforce: "pre",
    resolveId(id, importer) {
      // Stub ?url imports — these are SSR-only and crash in browser builds
      if (id.endsWith('?url')) return '\0stub:url-import';
      // Stub start.ts — it uses createMiddleware/createStart which are SSR-only
      if (id.includes('src/start') || id.endsWith('/start.ts') || id === './start.ts') return '\0stub:start';
      // Exact matches for known server packages
      if (STUB_IDS.includes(id)) return "\0stub:" + id;
      // Stub the auth middleware — it's server-only
      if (importer && id.includes("auth-middleware")) return "\0stub:auth-middleware";
      if (id.includes("auth-middleware")) return "\0stub:auth-middleware";
      // Stub all @tanstack/start-* packages
      if (id.startsWith("@tanstack/start-")) return "\0stub:generic";
      // Stub tanstack virtual modules
      if (id.startsWith("tanstack-start-")) return "\0stub:generic";
      return null;
    },
    load(id) {
      if (id === '\0stub:url-import') return `export default '';`;
      if (id === '\0stub:start') return `export const startInstance = { getOptions: () => ({}) }; export default {};`;
      if (id === "\0stub:generic") return `export default {}; export const __esModule = true;`;
      if (id === "\0stub:auth-middleware") {
        return `export const requireSupabaseAuth = () => {}; export default {};`;
      }
      const key = id.replace("\0stub:", "");
      if (key in STUB_CODE) return STUB_CODE[key];
      return null;
    },
    // Also intercept at the transform stage for files that resolve to the real package
    transform(code, id) {
      // If a file imports from @tanstack/react-start/server, replace those imports
      if (id.includes("auth-middleware")) {
        return {
          code: `
            export const requireSupabaseAuth = () => {};
            export default {};
          `,
          map: null,
        };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    stubServerModules(),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    // After build, rename index.capacitor.html → index.html for Capacitor
    {
      name: "rename-capacitor-html",
      closeBundle() {
        const src = path.resolve(__dirname, "dist/client/index.capacitor.html");
        const dest = path.resolve(__dirname, "dist/client/index.html");
        if (fs.existsSync(src)) fs.copyFileSync(src, dest);
      },
    } as Plugin,
  ],
  root: ".",
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "index.capacitor.html"),
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-pdf": ["jspdf"],
          "vendor-canvas": ["html2canvas"],
        },
      },
      external: [
        // Node built-ins — not available in browser
        /^node:/,
        // TanStack Start virtual modules
        /^tanstack-start-route-tree/,
        /^tanstack-start-server/,
        /^virtual:tanstack/,
      ],
    },
    outDir: "dist/client",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub the server-only auth middleware with a no-op for SPA builds
      "@/integrations/supabase/auth-middleware": path.resolve(
        __dirname,
        "src/integrations/supabase/auth-middleware.capacitor.ts"
      ),
      // Use capacitor-safe root route (no SSR imports)
      [path.resolve(__dirname, "src/routes/__root.tsx")]: path.resolve(
        __dirname,
        "src/routes/__root.capacitor.tsx"
      ),
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(externalSupabaseUrl),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("vavfsgbrfpvolskscolf"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(externalSupabasePublishableKey),
  },
});
