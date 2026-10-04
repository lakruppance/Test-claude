import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipReview, type ReviewData } from "@/components/clip-review";
import { t } from "@/i18n/messages";
import { signedDownloadUrl } from "@/lib/r2";
import type { TimedWord } from "@/lib/snap";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClipPage({ params }: PageProps<"/app/clips/[id]">) {
  const { id } = await params;
  const db = await supabaseServer(); // RLS: another user's clip is simply not found
  const { data: clip } = await db
    .from("clips")
    .select("id, job_id, status, style, with_hook, storage_key, thumbnail_key, duration_seconds, render_error, segments(*), jobs(id, source_filename, duration_seconds)")
    .eq("id", id)
    .maybeSingle();
  if (!clip) notFound();
  const segment = clip.segments as unknown as ReviewData["segment"];
  const job = clip.jobs as unknown as { id: string; source_filename: string; duration_seconds: number };
  const { data: transcript } = await db.from("transcripts").select("words").eq("job_id", clip.job_id).maybeSingle();

  const duration = Number(job.duration_seconds);
  const origStart = Number(segment.original_start_seconds ?? segment.start_seconds);
  const origEnd = Number(segment.original_end_seconds ?? segment.end_seconds);
  const windowStart = Math.max(0, Math.min(origStart, Number(segment.start_seconds)) - 30);
  const windowEnd = Math.min(duration, Math.max(origEnd, Number(segment.end_seconds)) + 30);
  const words = ((transcript?.words ?? []) as TimedWord[]).filter((w) => w.end > windowStart && w.start < windowEnd);
  const fileName = clip.storage_key.split("/").pop();

  const data: ReviewData = {
    id: clip.id,
    status: clip.status,
    style: clip.style,
    withHook: clip.with_hook,
    renderError: clip.render_error,
    videoUrl: await signedDownloadUrl(clip.storage_key),
    downloadUrl: await signedDownloadUrl(clip.storage_key, fileName),
    posterUrl: clip.thumbnail_key ? await signedDownloadUrl(clip.thumbnail_key) : null,
    segment,
    window: { start: windowStart, end: windowEnd },
    words,
  };

  return (
    <div className="grid gap-8">
      <nav className="flex flex-wrap gap-2 text-sm text-muted" aria-label={t("common.breadcrumb")}>
        <Link href="/app" className="underline underline-offset-4">{t("nav.dashboard")}</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/app/jobs/${job.id}`} className="underline underline-offset-4">{job.source_filename}</Link>
      </nav>
      <ClipReview data={data} />
    </div>
  );
}
