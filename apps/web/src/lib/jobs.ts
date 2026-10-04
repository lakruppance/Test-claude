import { tasks } from "@trigger.dev/sdk";
import { env } from "./env";
import { startLocalJob } from "./local-runner";
import { RIGHTS_STATEMENT, RIGHTS_STATEMENT_VERSION } from "./rights";
import { sourcePrefix } from "./storage-keys";
import { supabaseAdmin } from "./supabase-admin";
import type { processVideo } from "../trigger/process-video";
import type { rerenderClip } from "../trigger/rerender-clip";

export type RightsContext = {
  contentKind: "upload" | "drive" | "dropbox" | "youtube" | "channel";
  contentRef: string;
  ip?: string | null;
  userAgent?: string | null;
};

export function requestContext(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded && /^[0-9a-fA-F.:]+$/.test(forwarded) ? forwarded : null,
    userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  };
}

export async function recordRights(userId: string, jobId: string | null, rights: RightsContext) {
  const { error } = await supabaseAdmin().from("rights_declarations").insert({
    user_id: userId,
    job_id: jobId,
    content_kind: rights.contentKind,
    content_ref: rights.contentRef.slice(0, 1000),
    statement_version: RIGHTS_STATEMENT_VERSION,
    statement: RIGHTS_STATEMENT,
    ip_address: rights.ip ?? null,
    user_agent: rights.userAgent ?? null,
  });
  if (error) throw new Error(`rights declaration failed: ${error.message}`);
}

// Creates a job for a linked source (Drive, Dropbox, YouTube) and queues it immediately.
export async function createLinkJob(opts: {
  userId: string;
  kind: "drive" | "dropbox" | "youtube";
  url: string;
  title: string;
  style: string;
  withHook: boolean;
  rights: RightsContext | null; // null when covered by an existing channel declaration
}): Promise<string> {
  const db = supabaseAdmin();
  const jobId = crypto.randomUUID();
  const { error } = await db.from("jobs").insert({
    id: jobId,
    user_id: opts.userId,
    status: "queued",
    source_kind: opts.kind,
    source_url: opts.url,
    source_key: `${sourcePrefix(opts.userId, jobId)}/source.mp4`,
    source_filename: opts.title.slice(0, 255),
    options: { style: opts.style, with_hook: opts.withHook },
  });
  if (error) throw new Error(`job insert failed: ${error.message}`);
  if (opts.rights) {
    try {
      await recordRights(opts.userId, jobId, opts.rights);
    } catch (e) {
      await db.from("jobs").delete().eq("id", jobId);
      throw e;
    }
  }
  await enqueueJob(jobId, opts.userId);
  return jobId;
}

// Starts processing: Trigger.dev in staging/production, in-process runner locally.
export async function enqueueJob(jobId: string, userId: string) {
  const db = supabaseAdmin();
  if (env().ORCHESTRATOR === "local") {
    await db.from("jobs").update({ status: "queued" }).eq("id", jobId);
    startLocalJob(jobId);
    return;
  }
  const handle = await tasks.trigger<typeof processVideo>(
    "process-video",
    { jobId },
    { idempotencyKey: `process-video-${jobId}`, tags: [`job_${jobId}`, `user_${userId}`] },
  );
  await db.from("jobs").update({ status: "queued", trigger_run_id: handle.id }).eq("id", jobId);
}

export async function enqueueRerender(clipId: string) {
  if (env().ORCHESTRATOR === "local") {
    const { runRerender } = await import("./rerender");
    void runRerender(clipId, (s) => new Promise((r) => setTimeout(r, s * 1000)), 2).catch((e) =>
      console.error(`rerender ${clipId} failed`, e),
    );
    return;
  }
  await tasks.trigger<typeof rerenderClip>("rerender-clip", { clipId }, { tags: [`clip_${clipId}`] });
}
