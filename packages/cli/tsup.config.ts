import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// One bundled file. Everything is inlined except resvg, which ships as
// per-platform native packages and has to stay a real dependency.
export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  minify: false,
  splitting: false,
  define: { __VERSION__: JSON.stringify(pkg.version) },
  noExternal: [/^(?!@resvg\/)/],
  external: ["@resvg/resvg-js"],
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __vrCreateRequire } from 'node:module';",
      "const require = __vrCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
