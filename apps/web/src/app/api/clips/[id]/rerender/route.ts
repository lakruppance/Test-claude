import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueRerender } from "@/lib/jobs";
import { snapBounds, type TimedWord } from "@/lib/snap";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const body = z.object({
  start: z.number().min(0),
  end: z.number().positive(),
  style: z.enum(["impact", "boite", "epure"]),
  withHook: z.boolean(),
});

const MAX_RENDERS_PER_JOB = 40;

// Re-render a clip with new bounds (snapped to words), caption style or hook setting.
export async function POST(request: Request, ctx: RouteContext<"/api/clips/[id]/rerender">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const db = await supabaseServer(); // RLS: only the owner's rows are visible
  const { data: clip } = await db
    .from("clips")
    .select("id, job_id, segment_id, style, status, jobs(duration_seconds)")
    .eq("id", id)
    .maybeSingle();
  if (!clip) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (clip.status === "rendering") return NextResponse.json({ error: "rendering" }, { status: 409 });

  const { data: transcript } = await db.from("transcripts").select("words").eq("job_id", clip.job_id).maybeSingle();
  const duration = Number((clip.jobs as unknown as { duration_seconds: number } | null)?.duration_seconds ?? 0);
  const snapped = snapBounds((transcript?.words ?? []) as TimedWord[], parsed.data.start, parsed.data.end, duration);
  if ("error" in snapped) return NextResponse.json({ error: snapped.error }, { status: 400 });

  const admin = supabaseAdmin();
  if (parsed.data.style !== clip.style) {
    const { count } = await admin.from("clips").select("id", { count: "exact", head: true })
      .eq("segment_id", clip.segment_id).eq("style", parsed.data.style);
    if (count) return NextResponse.json({ error: "style_exists" }, { status: 409 });
  }
  const { count: renders } = await admin.from("cost_events").select("id", { count: "exact", head: true })
    .eq("job_id", clip.job_id).eq("step", "render");
  if ((renders ?? 0) >= MAX_RENDERS_PER_JOB) return NextResponse.json({ error: "render_limit" }, { status: 429 });

  await admin.from("segments").update({ start_seconds: snapped.start, end_seconds: snapped.end }).eq("id", clip.segment_id);
  await admin.from("clips").update({
    status: "rendering",
    style: parsed.data.style,
    with_hook: parsed.data.withHook,
    render_error: null,
  }).eq("id", id);
  await enqueueRerender(id);
  return NextResponse.json({ ok: true, ...snapped });
}
