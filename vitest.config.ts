import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Set in the config (main) process so globalSetup, the db reader and db-reset
// all see it; forked test workers inherit it. `test.env` would only reach the
// workers, not globalSetup.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/app_test";

export default defineConfig({
  plugins: [viteReact()],
  resolve: { tsconfigPaths: true },
  test: {
    // No root-level `include`: each project sets its own so `.test.ts` (unit,
    // node + db) and `.test.tsx` (component, jsdom) never cross over.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
          globalSetup: "src/test/global-setup.ts",
          setupFiles: "src/test/db-reset.ts",
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: "src/test/jsdom-setup.ts",
        },
      },
    ],
  },
});
