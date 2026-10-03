import { NextResponse } from "next/server";
import { signedDownloadUrl } from "@/lib/r2";
import { outputPrefix, ANONYMOUS_OWNER } from "@/lib/storage-keys";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { summarizeCosts } from "@/lib/costs";

// Phase 1 (staging, no accounts): every job is visible behind the staging password.
// Phase 2 replaces this with the user's session and RLS.
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const db = supabaseAdmin();
  const { data: job } = await db
    .from("jobs")
    .select(
      "id, status, source_filename, duration_seconds, language, current_step, progress, error_code, error_message, cost_usd, created_at, finished_at",
    )
    .eq("id", id)
    .single();
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [steps, segments, clips, costs] = await Promise.all([
    db.from("job_steps").select("step, status, attempts, started_at, finished_at, error_code").eq("job_id", id),
    db.from("segments").select("*").eq("job_id", id).order("rank"),
    db.from("clips").select("*").eq("job_id", id),
    db.from("cost_events").select("step, provider, item, quantity, unit, usd, meta").eq("job_id", id),
  ]);

  const clipsWithUrls = await Promise.all(
    (clips.data ?? []).map(async (clip) => ({
      ...clip,
      download_url: await signedDownloadUrl(clip.storage_key, clip.storage_key.split("/").pop()),
      thumbnail_url: clip.thumbnail_key ? await signedDownloadUrl(clip.thumbnail_key) : null,
    })),
  );
  const segmentsJsonUrl =
    job.status === "succeeded"
      ? await signedDownloadUrl(`${outputPrefix(ANONYMOUS_OWNER, id)}/segments.json`, "segments.json")
      : null;

  return NextResponse.json(
    {
      job,
      steps: steps.data ?? [],
      segments: segments.data ?? [],
      clips: clipsWithUrls,
      segments_json_url: segmentsJsonUrl,
      costs: summarizeCosts(costs.data ?? [], Number(job.duration_seconds ?? 0)),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
