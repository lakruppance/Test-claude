import { describe, expect, it } from "vitest";
import { MAX_STEP_ATTEMPTS, processJob, type OrchestratorDeps, type StepRow } from "./orchestrator";
import type { CallStatus, StepName, StepPayload } from "./worker";

type Script = Partial<Record<StepName, CallStatus[]>>;

function fakeDeps(script: Script, existingSteps: StepRow[] = []) {
  const job: Record<string, unknown> = { id: "j1", user_id: null, status: "queued", options: { style: "boite" } };
  const steps = new Map(existingSteps.map((s) => [s.step, { ...s }]));
  const started: { step: StepName; payload: StepPayload }[] = [];
  const calls = new Map<string, StepName>();
  const queues: Script = JSON.parse(JSON.stringify(script));
  const deps: OrchestratorDeps = {
    getJob: async () => job as never,
    getSteps: async () => [...steps.values()],
    updateJob: async (_id, patch) => void Object.assign(job, patch),
    upsertStep: async (_j, _u, step, patch) => {
      steps.set(step, { ...(steps.get(step) ?? { step, status: "pending", attempts: 0, output: null }), ...patch } as StepRow);
    },
    startStep: async (step, payload) => {
      started.push({ step, payload });
      const id = `call-${started.length}`;
      calls.set(id, step);
      return id;
    },
    pollCall: async (callId) => {
      const step = calls.get(callId)!;
      const next = queues[step]?.shift();
      return next ?? defaultResult(step);
    },
    sleep: async () => {},
  };
  return { deps, job, steps, started };
}

function defaultResult(step: StepName): CallStatus {
  const results: Record<StepName, Record<string, unknown>> = {
    prepare: { duration: 600, width: 1920, height: 1080 },
    transcribe: { language: "fr" },
    detect: { to_render: ["s1", "s2", "s3"] },
    render: { storage_key: "k" },
  };
  return { status: "succeeded", result: results[step] };
}

describe("processJob", () => {
  it("runs all steps, renders each selected segment and finishes at 100%", async () => {
    const { deps, job, started } = fakeDeps({ transcribe: [{ status: "pending" }] });
    const out = await processJob(deps, "j1", "anonymous");
    expect(out).toEqual({ skipped: false, clips: 3 });
    expect(started.map((s) => s.step)).toEqual(["prepare", "transcribe", "detect", "render", "render", "render"]);
    expect(started.filter((s) => s.step === "render").every((s) => s.payload.style === "boite")).toBe(true);
    expect(job).toMatchObject({ status: "succeeded", progress: 100, language: "fr", duration_seconds: 600 });
  });

  it("retries a retryable failure and resumes", async () => {
    const crash: CallStatus = { status: "failed", retryable: true, code: "worker_crash", message: "OOM" };
    const { deps, job, started, steps } = fakeDeps({ detect: [crash] });
    await processJob(deps, "j1", "anonymous");
    const detects = started.filter((s) => s.step === "detect");
    expect(detects.map((d) => d.payload.attempt)).toEqual([1, 2]);
    expect(steps.get("detect")?.attempts).toBe(2);
    expect(job.status).toBe("succeeded");
  });

  it("stops with a stable error code on a non-retryable failure", async () => {
    const bad: CallStatus = { status: "failed", retryable: false, code: "no_speech", message: "no speech" };
    const { deps, steps, started } = fakeDeps({ transcribe: [bad] });
    await expect(processJob(deps, "j1", "anonymous")).rejects.toMatchObject({ code: "no_speech" });
    expect(steps.get("transcribe")?.status).toBe("failed");
    expect(started.some((s) => s.step === "detect")).toBe(false);
  });

  it(`gives up after ${MAX_STEP_ATTEMPTS} attempts`, async () => {
    const crash: CallStatus = { status: "failed", retryable: true, code: "worker_crash", message: "x" };
    const { deps } = fakeDeps({ prepare: [crash, crash, crash] });
    await expect(processJob(deps, "j1", "anonymous")).rejects.toMatchObject({ code: "worker_crash" });
  });

  it("skips steps that already succeeded (resume after a run retry)", async () => {
    const done: StepRow[] = [
      { step: "prepare", status: "succeeded", attempts: 1, output: { duration: 60, width: 1, height: 1 } },
      { step: "transcribe", status: "succeeded", attempts: 1, output: { language: "en" } },
    ];
    const { deps, started } = fakeDeps({}, done);
    await processJob(deps, "j1", "anonymous");
    expect(started[0].step).toBe("detect");
  });
});
