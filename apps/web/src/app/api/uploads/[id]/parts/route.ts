import { NextResponse } from "next/server";
import { resumeMultipartUpload } from "@/lib/r2";
import { planParts } from "@/lib/storage-keys";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

// Resume an interrupted upload: which parts the storage already has, and URLs for the rest.
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]/parts">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await supabaseServer(); // RLS: only the owner's job is visible
  const { data: job } = await db
    .from("jobs")
    .select("id, status, source_key, source_bytes, options")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.status !== "uploading" || !job.options?.upload_id) {
    return NextResponse.json({ error: "not_resumable" }, { status: 404 });
  }
  const { partSize, count } = planParts(Number(job.source_bytes));
  try {
    const { uploaded, urls } = await resumeMultipartUpload(job.source_key, job.options.upload_id, count);
    return NextResponse.json({ jobId: job.id, partSize, partCount: count, uploaded, urls });
  } catch {
    return NextResponse.json({ error: "not_resumable" }, { status: 404 });
  }
}
