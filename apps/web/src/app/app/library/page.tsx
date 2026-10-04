import Link from "next/link";
import { LibraryGrid, type LibraryClip } from "@/components/library-grid";
import { PageTitle, cx, styleName } from "@/components/ui";
import { t } from "@/i18n/messages";
import { signedDownloadUrl } from "@/lib/r2";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUSES = ["pending_review", "approved", "rejected"] as const;
const STYLES = ["impact", "boite", "epure"] as const;

export default async function LibraryPage({ searchParams }: PageProps<"/app/library">) {
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);
  const style = STYLES.find((s) => s === params.style);
  const db = await supabaseServer(); // RLS: only the user's clips
  let query = db
    .from("clips")
    .select("id, status, style, storage_key, thumbnail_key, duration_seconds, created_at, segments(titre_propose, score_global), jobs(source_filename)")
    .order("created_at", { ascending: false })
    .limit(120);
  if (status) query = query.eq("status", status);
  if (style) query = query.eq("style", style);
  const { data } = await query;

  const clips: LibraryClip[] = await Promise.all(
    (data ?? []).map(async (c) => {
      const seg = c.segments as unknown as { titre_propose: string; score_global: number };
      const job = c.jobs as unknown as { source_filename: string };
      return {
        id: c.id,
        status: c.status,
        style: c.style,
        title: seg.titre_propose,
        score: Number(seg.score_global),
        source: job.source_filename,
        duration: Number(c.duration_seconds),
        thumbnailUrl: c.thumbnail_key ? await signedDownloadUrl(c.thumbnail_key) : null,
        downloadUrl: await signedDownloadUrl(c.storage_key, c.storage_key.split("/").pop()),
      };
    }),
  );

  const href = (next: { status?: string; style?: string }) => {
    const q = new URLSearchParams();
    const merged = { status, style, ...next };
    if (merged.status) q.set("status", merged.status);
    if (merged.style) q.set("style", merged.style);
    const s = q.toString();
    return s ? `/app/library?${s}` : "/app/library";
  };
  const chip = (active: boolean) =>
    cx("rounded-full border px-3 py-1.5 text-sm", active ? "border-ink bg-ink text-paper" : "border-line hover:bg-line/50");

  return (
    <div className="grid gap-8">
      <PageTitle title={t("library.title")} lead={t("library.lead")} />
      <div className="grid gap-3">
        <nav aria-label={t("library.filterStatus")} className="flex flex-wrap gap-2">
          <Link href={href({ status: "" })} className={chip(!status)} aria-current={!status ? "page" : undefined}>
            {t("library.filter.all")}
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={href({ status: s })} className={chip(status === s)} aria-current={status === s ? "page" : undefined}>
              {t(`clip.status.${s}`)}
            </Link>
          ))}
        </nav>
        <nav aria-label={t("library.filterStyle")} className="flex flex-wrap gap-2">
          <Link href={href({ style: "" })} className={chip(!style)} aria-current={!style ? "page" : undefined}>
            {t("library.allStyles")}
          </Link>
          {STYLES.map((s) => (
            <Link key={s} href={href({ style: s })} className={chip(style === s)} aria-current={style === s ? "page" : undefined}>
              {styleName(t(`upload.style.${s}`))}
            </Link>
          ))}
        </nav>
      </div>
      {clips.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">{t("library.empty")}</p>
      ) : (
        <LibraryGrid clips={clips} />
      )}
    </div>
  );
}
