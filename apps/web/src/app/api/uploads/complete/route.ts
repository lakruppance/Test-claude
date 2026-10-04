import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs";
import { completeMultipartUpload } from "@/lib/r2";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  await enqueueJob(jobId, user.id);
  return NextResponse.json({ jobId, status: "queued" });
}
