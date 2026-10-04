import { defineConfig } from "vitest/config";

const integration = process.env.VITEST_INTEGRATION === "1";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    include: integration ? ["src/**/*.int.test.ts"] : ["src/**/*.test.ts"],
    exclude: integration ? [] : ["src/**/*.int.test.ts", "node_modules/**"],
    environment: "node",
  },
});
