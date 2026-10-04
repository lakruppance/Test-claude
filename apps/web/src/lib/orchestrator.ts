// Job orchestration, independent of Trigger.dev so it can be unit-tested.
// - Each step's outcome is persisted in job_steps; a re-run skips succeeded steps (resume).
// - Retryable worker failures are retried with backoff; expected failures stop the job with a
//   stable error code the UI translates.

import { overallProgress, type ProgressStep } from "./progress";
import type { CallStatus, StepName, StepPayload } from "./worker";

export type JobRow = {
  id: string;
  user_id: string;
  status: string;
  source_kind?: string;
  options: { style?: string; with_hook?: boolean } | null;
};

export type StepRow = { step: string; status: string; attempts: number; output: unknown };

export interface OrchestratorDeps {
  getJob(jobId: string): Promise<JobRow>;
  getSteps(jobId: string): Promise<StepRow[]>;
  updateJob(jobId: string, patch: Record<string, unknown>): Promise<void>;
  upsertStep(jobId: string, userId: string | null, step: string, patch: Record<string, unknown>): Promise<void>;
  startStep(step: StepName, payload: StepPayload): Promise<string>;
  pollCall(callId: string): Promise<CallStatus>;
  sleep(seconds: number): Promise<void>;
  /** Plan limits of the job owner. */
  getPlanLimits(userId: string): Promise<{ maxVideoMinutes: number }>;
  /** Atomically checks the monthly quota and reserves the job's minutes (idempotent per job). */
  reserveMinutes(userId: string, jobId: string, minutes: number): Promise<{ ok: boolean; reason?: string }>;
  /** Gives the reserved minutes back (job failed). Idempotent. */
  releaseMinutes(jobId: string): Promise<void>;
  /** Seconds between polls of running worker calls (default POLL_SECONDS). */
  pollSeconds?: number;
  log?(message: string, data?: Record<string, unknown>): void;
}

export class JobFailedError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_STEP_ATTEMPTS = 3;
export const POLL_SECONDS = 10;
const DEFAULT_STYLE = "impact";

type Started = { key: string; step: StepName; payload: StepPayload; callId: string };

/**
 * Runs several calls of the same step concurrently (renders) or a single call, polling them in
 * one loop. Retryable failures are restarted until MAX_STEP_ATTEMPTS.
 */
async function runCalls(
  deps: OrchestratorDeps,
  jobId: string,
  userId: string | null,
  stepKey: string,
  step: StepName,
  payloads: { key: string; payload: Omit<StepPayload, "attempt"> }[],
  priorAttempts: number,
  onProgress?: (done: number, total: number) => Promise<void>,
): Promise<Record<string, Record<string, unknown>>> {
  const results: Record<string, Record<string, unknown>> = {};
  const attempts: Record<string, number> = {};
  let pending: Started[] = [];

  const start = async (key: string, payload: Omit<StepPayload, "attempt">) => {
    attempts[key] = (attempts[key] ?? priorAttempts) + 1;
    const full = { ...payload, attempt: attempts[key] } as StepPayload;
    const callId = await deps.startStep(step, full);
    pending.push({ key, step, payload: full, callId });
  };

  await deps.upsertStep(jobId, userId, stepKey, {
    status: "running",
    started_at: new Date().toISOString(),
    attempts: priorAttempts + 1,
  });
  for (const p of payloads) await start(p.key, p.payload);

  while (pending.length > 0) {
    await deps.sleep(deps.pollSeconds ?? POLL_SECONDS);
    const polled = pending;
    pending = [];
    const retries: Started[] = [];
    for (const call of polled) {
      const status = await deps.pollCall(call.callId);
      if (status.status === "pending") {
        pending.push(call);
      } else if (status.status === "succeeded") {
        results[call.key] = status.result;
      } else if (status.retryable && attempts[call.key] < MAX_STEP_ATTEMPTS) {
        deps.log?.("retrying step", { step: call.step, key: call.key, code: status.code });
        retries.push(call);
      } else {
        await deps.upsertStep(jobId, userId, stepKey, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error_code: status.code,
          error_message: status.message,
          attempts: attempts[call.key],
        });
        throw new JobFailedError(status.code, status.message);
      }
    }
    for (const call of retries) {
      await deps.sleep(Math.min(15 * 2 ** (attempts[call.key] - 1), 120));
      await start(call.key, call.payload); // `start` sets the new attempt number
    }
    await onProgress?.(Object.keys(results).length, payloads.length);
  }

  await deps.upsertStep(jobId, userId, stepKey, {
    status: "succeeded",
    finished_at: new Date().toISOString(),
    output: payloads.length === 1 ? results[payloads[0].key] : results,
    attempts: Math.max(...Object.values(attempts)),
  });
  return results;
}

export async function processJob(deps: OrchestratorDeps, jobId: string) {
  try {
    return await runJob(deps, jobId);
  } catch (error) {
    // Expected failure: give the reserved minutes back. Unexpected errors are retried by the
    // caller, which releases the minutes only once it gives up.
    if (error instanceof JobFailedError) await deps.releaseMinutes(jobId);
    throw error;
  }
}

export const minutesOf = (seconds: number) => Math.ceil((seconds / 60) * 100) / 100;

async function runJob(deps: OrchestratorDeps, jobId: string) {
  const job = await deps.getJob(jobId);
  if (job.status === "succeeded" || job.status === "canceled") return { skipped: true };
  const done = new Map((await deps.getSteps(jobId)).map((s) => [s.step, s]));
  const limits = await deps.getPlanLimits(job.user_id);
  const base = {
    job_id: jobId,
    owner_id: job.user_id,
    user_id: job.user_id,
    max_source_minutes: limits.maxVideoMinutes,
  };

  await deps.updateJob(jobId, {
    status: "running",
    error_code: null,
    error_message: null,
  });

  const simpleStep = async (step: Exclude<StepName, "render">) => {
    const prior = done.get(step);
    if (prior?.status === "succeeded") return prior.output as Record<string, unknown>;
    await deps.updateJob(jobId, {
      current_step: step,
      progress: overallProgress(step as ProgressStep, 0),
    });
    const out = await runCalls(deps, jobId, job.user_id, step, step, [{ key: step, payload: base }],
      prior?.attempts ?? 0);
    return out[step];
  };

  if (job.source_kind && job.source_kind !== "upload") {
    // Drive, Dropbox or YouTube link: download it into storage first.
    const fetched = await simpleStep("fetch");
    await deps.updateJob(jobId, {
      source_bytes: fetched.bytes,
      ...(fetched.title ? { source_filename: String(fetched.title).slice(0, 255) } : {}),
    });
  }
  const prepared = await simpleStep("prepare");
  const reservation = await deps.reserveMinutes(job.user_id, jobId, minutesOf(Number(prepared.duration)));
  if (!reservation.ok) {
    throw new JobFailedError(reservation.reason ?? "quota_exceeded", "Monthly minutes quota exceeded");
  }
  await deps.updateJob(jobId, {
    duration_seconds: prepared.duration,
    width: prepared.width,
    height: prepared.height,
  });
  const transcribed = await simpleStep("transcribe");
  await deps.updateJob(jobId, { language: transcribed.language });
  const detected = await simpleStep("detect");

  const segmentIds = (detected.to_render as string[]) ?? [];
  const style = job.options?.style ?? DEFAULT_STYLE;
  const withHook = job.options?.with_hook ?? true;
  const prior = done.get("render");
  if (prior?.status !== "succeeded") {
    await deps.updateJob(jobId, { current_step: "render", progress: overallProgress("render", 0) });
    await runCalls(
      deps,
      jobId,
      job.user_id,
      "render",
      "render",
      segmentIds.map((id) => ({
        key: id,
        payload: { ...base, segment_id: id, style, with_hook: withHook },
      })),
      prior?.attempts ?? 0,
      (n, total) => deps.updateJob(jobId, { progress: overallProgress("render", n / total) }),
    );
  }

  await deps.updateJob(jobId, {
    status: "succeeded",
    current_step: null,
    progress: 100,
    finished_at: new Date().toISOString(),
  });
  return { skipped: false, clips: segmentIds.length };
}
