import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth: the kit lives in the plugin, never copied here.
const kitDir = path.resolve(here, "../../plugins/pignolo/skills/ui/kit");
const entry = path.join(here, "src/main.tsx");

// Files in the kit import bare packages (react, motion, @radix-ui/*). They live
// outside this project, so resolve those imports as if written from src/main.tsx.
function kitBareImports(): Plugin {
  return {
    name: "kit-bare-imports",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const rel = path.relative(kitDir, importer);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
      if (source.startsWith(".") || source.startsWith("/") || path.isAbsolute(source)) return null;
      return this.resolve(source, entry, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [kitBareImports(), react(), tailwindcss()],
  resolve: { alias: { "@kit": kitDir } },
  server: { fs: { allow: [here, kitDir] } },
  build: { chunkSizeWarningLimit: 800 },
});
