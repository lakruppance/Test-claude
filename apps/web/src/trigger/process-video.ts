import { logger, task, wait } from "@trigger.dev/sdk";
import { JobFailedError, processJob } from "../lib/orchestrator";
import { supabaseDeps } from "../lib/orchestrator-deps";
import { supabaseAdmin } from "../lib/supabase-admin";

type Payload = { jobId: string };

export const processVideo = task({
  id: "process-video",
  // Compute time only: checkpointed waits while Modal works do not count.
  maxDuration: 3600,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 10_000, maxTimeoutInMs: 120_000 },
  run: async (payload: Payload) => {
    const deps = {
      ...supabaseDeps((seconds) => wait.for({ seconds })),
      log: (message: string, data?: Record<string, unknown>) => logger.info(message, data),
    };
    try {
      return await processJob(deps, payload.jobId);
    } catch (error) {
      if (error instanceof JobFailedError) {
        // Expected failure (bad input, nothing to clip...): record it and do not retry the run.
        await deps.updateJob(payload.jobId, {
          status: "failed",
          error_code: error.code,
          error_message: error.message,
          finished_at: new Date().toISOString(),
        });
        return { skipped: false, failed: error.code };
      }
      throw error; // unexpected: Trigger.dev retries the run, which resumes after the last good step
    }
  },
  onFailure: async ({ payload, error }) => {
    // All run attempts exhausted: refund the minutes and make the failure visible.
    await supabaseAdmin().rpc("release_minutes", { p_job: payload.jobId });
    await supabaseAdmin()
      .from("jobs")
      .update({
        status: "failed",
        error_code: "internal_error",
        error_message: String(error instanceof Error ? error.message : error).slice(0, 1000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", payload.jobId);
  },
});
