import { NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { summarizeCosts } from "@/lib/costs";
import { signedDownloadUrl } from "@/lib/r2";
import { outputPrefix } from "@/lib/storage-keys";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Every read goes through the user's session (RLS): another user's job is simply not found.
// Download URLs are only signed for storage keys read from rows the user is allowed to see.
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const db = await supabaseServer();
  const { data: job } = await db
    .from("jobs")
    .select("id, user_id, status, source_filename, duration_seconds, language, current_step, progress, error_code, created_at, finished_at")
    .eq("id", id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [steps, segments, clips] = await Promise.all([
    db.from("job_steps").select("step, status, attempts, started_at, finished_at, error_code").eq("job_id", id),
    db.from("segments").select("*").eq("job_id", id).order("rank"),
    db.from("clips").select("*").eq("job_id", id),
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
      ? await signedDownloadUrl(`${outputPrefix(job.user_id, id)}/segments.json`, "segments.json")
      : null;

  // Processing costs are internal: only admins see them.
  const account = await getAccount(user.id);
  let costs = null;
  if (account.isAdmin) {
    const { data } = await supabaseAdmin()
      .from("cost_events")
      .select("step, provider, item, quantity, unit, usd, meta")
      .eq("job_id", id);
    costs = summarizeCosts(data ?? [], Number(job.duration_seconds ?? 0));
  }

  return NextResponse.json(
    {
      job,
      steps: steps.data ?? [],
      segments: segments.data ?? [],
      clips: clipsWithUrls,
      segments_json_url: segmentsJsonUrl,
      costs,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
