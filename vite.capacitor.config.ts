// Capacitor/Android SPA build — no SSR, no Cloudflare Workers.
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

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
      export const createServerFn = () => () => {};
      export const createMiddleware = () => ({ server: () => ({}) });
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
  plugins: [stubServerModules(), react(), tailwindcss(), tsconfigPaths()],
  root: ".",
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "index.capacitor.html"),
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
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  },
});
