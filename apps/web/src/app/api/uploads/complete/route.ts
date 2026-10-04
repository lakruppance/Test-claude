import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { startLocalJob } from "@/lib/local-runner";
import { completeMultipartUpload } from "@/lib/r2";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { processVideo } from "@/trigger/process-video";

const body = z.object({
  jobId: z.string().uuid(),
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1) }))
    .min(1),
});

// Finalizes the upload, then queues the processing run (idempotent per job).
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { jobId, parts } = parsed.data;

  const db = supabaseAdmin();
  const { data: job } = await db
    .from("jobs")
    .select("id, user_id, status, source_key, options")
    .eq("id", jobId)
    .eq("user_id", user.id) // ownership check: another user's job id behaves as not found
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.status !== "uploading") return NextResponse.json({ jobId, status: job.status });

  try {
    await completeMultipartUpload(job.source_key, job.options.upload_id, parts);
  } catch {
    return NextResponse.json({ error: "upload_incomplete" }, { status: 409 });
  }

  if (env().ORCHESTRATOR === "local") {
    await db.from("jobs").update({ status: "queued" }).eq("id", jobId);
    startLocalJob(jobId);
    return NextResponse.json({ jobId, status: "queued" });
  }

  const handle = await tasks.trigger<typeof processVideo>(
    "process-video",
    { jobId },
    { idempotencyKey: `process-video-${jobId}`, tags: [`job_${jobId}`, `user_${user.id}`] },
  );
  await db.from("jobs").update({ status: "queued", trigger_run_id: handle.id }).eq("id", jobId);
  return NextResponse.json({ jobId, status: "queued" });
}
