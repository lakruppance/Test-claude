import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

// Variables the orchestrator needs at runtime, copied from the deploy environment (GitHub
// Actions secrets) into the Trigger.dev environment on each deploy. Never printed.
const RUNTIME_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WORKER_ENDPOINT_URL",
  "WORKER_SHARED_SECRET",
] as const;

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_placeholder",
  dirs: ["./src/trigger"],
  maxDuration: 3600,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 10_000, maxTimeoutInMs: 120_000 },
  },
  build: {
    extensions: [
      syncEnvVars(() =>
        RUNTIME_VARS.filter((name) => process.env[name]).map((name) => ({
          name,
          value: process.env[name] as string,
          isSecret: name !== "NEXT_PUBLIC_SUPABASE_URL" && name !== "WORKER_ENDPOINT_URL",
        })),
      ),
    ],
  },
});
