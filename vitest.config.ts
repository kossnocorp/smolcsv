import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    include:
      mode === "comparison" ? ["tests/comparison.ts"] : ["src/**/*.test.ts"],
    isolate: false,
    sequence: {
      // It will speed up the tests but won't work with Sinon
      // concurrent: true,
    },
  },
}));
