import { supabaseAdmin } from "./supabase-admin";
import type { JobRow, OrchestratorDeps, StepRow } from "./orchestrator";
import { pollCall, startStep } from "./worker";

// Supabase + Modal implementations of the orchestrator dependencies (sleep is injected by the
// caller: Trigger.dev's checkpointed wait in production).
export function supabaseDeps(sleep: (seconds: number) => Promise<void>): OrchestratorDeps {
  const db = supabaseAdmin();
  return {
    async getJob(jobId) {
      const { data, error } = await db
        .from("jobs")
        .select("id, user_id, status, source_kind, options")
        .eq("id", jobId)
        .single();
      if (error) throw new Error(`Job ${jobId} not found: ${error.message}`);
      return data as JobRow;
    },
    async getSteps(jobId) {
      const { data, error } = await db
        .from("job_steps")
        .select("step, status, attempts, output")
        .eq("job_id", jobId);
      if (error) throw new Error(error.message);
      return (data ?? []) as StepRow[];
    },
    async updateJob(jobId, patch) {
      const { error } = await db.from("jobs").update(patch).eq("id", jobId);
      if (error) throw new Error(error.message);
    },
    async upsertStep(jobId, userId, step, patch) {
      const { error } = await db
        .from("job_steps")
        .upsert({ job_id: jobId, user_id: userId, step, ...patch }, { onConflict: "job_id,step" });
      if (error) throw new Error(error.message);
    },
    async getPlanLimits(userId) {
      const { data, error } = await db
        .from("profiles")
        .select("plans(max_video_minutes)")
        .eq("id", userId)
        .single();
      if (error) throw new Error(error.message);
      const plan = data.plans as unknown as { max_video_minutes: number } | null;
      return { maxVideoMinutes: plan?.max_video_minutes ?? 20 };
    },
    async reserveMinutes(userId, jobId, minutes) {
      const { data, error } = await db.rpc("reserve_minutes", {
        p_user: userId,
        p_job: jobId,
        p_minutes: minutes,
      });
      if (error) throw new Error(error.message);
      return data as { ok: boolean; reason?: string };
    },
    async releaseMinutes(jobId) {
      const { error } = await db.rpc("release_minutes", { p_job: jobId });
      if (error) throw new Error(error.message);
    },
    startStep,
    pollCall,
    sleep,
  };
}
