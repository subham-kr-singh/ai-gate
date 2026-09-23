import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // `.tsx` must be included: the component tests (mock UI, the test Timer)
    // live in .tsx files. With only `**/*.test.ts` they were silently never
    // collected, so `vitest run` reported a fully green suite while the UI
    // tests had never executed.
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "projects/**"],
  },
  // The .tsx tests use JSX without importing React (Next's automatic runtime),
  // so esbuild needs the same setting or every component test fails on
  // "React is not defined".
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
