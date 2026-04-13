import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/co2de.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
