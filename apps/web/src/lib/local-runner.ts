import { JobFailedError, processJob } from "./orchestrator";
import { supabaseDeps } from "./orchestrator-deps";

// Local orchestration (ORCHESTRATOR=local): runs jobs inside the Next.js server process,
// replacing Trigger.dev for small-scale testing on one machine. Not for serverless hosting.

const running = new Set<string>();
const MAX_RUN_ATTEMPTS = 3;
const sleep = (seconds: number) => new Promise<void>((r) => setTimeout(r, seconds * 1000));

export function startLocalJob(jobId: string, ownerId: string): void {
  if (running.has(jobId)) return;
  running.add(jobId);
  void run(jobId, ownerId).finally(() => running.delete(jobId));
}

async function run(jobId: string, ownerId: string) {
  const deps = { ...supabaseDeps(sleep), pollSeconds: 3, log: (m: string, d?: object) => console.info(`[job ${jobId}] ${m}`, d ?? "") };
  for (let attempt = 1; ; attempt++) {
    try {
      await processJob(deps, jobId, ownerId);
      return;
    } catch (error) {
      if (error instanceof JobFailedError) {
        await deps.updateJob(jobId, {
          status: "failed",
          error_code: error.code,
          error_message: error.message,
          finished_at: new Date().toISOString(),
        });
        return;
      }
      console.error(`[job ${jobId}] attempt ${attempt} crashed`, error);
      if (attempt >= MAX_RUN_ATTEMPTS) {
        await deps.updateJob(jobId, {
          status: "failed",
          error_code: "internal_error",
          error_message: String(error instanceof Error ? error.message : error).slice(0, 1000),
          finished_at: new Date().toISOString(),
        });
        return;
      }
      await sleep(10 * attempt); // then resume after the last succeeded step
    }
  }
}

// Called once at server start: resume jobs interrupted by a restart.
export async function resumeLocalJobs(ownerId: string) {
  const { supabaseAdmin } = await import("./supabase-admin");
  const { data } = await supabaseAdmin().from("jobs").select("id").in("status", ["queued", "running"]);
  for (const job of data ?? []) startLocalJob(job.id, ownerId);
}
