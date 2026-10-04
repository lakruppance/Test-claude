"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { buttonClass, cx, scoreTone, styleName } from "@/components/ui";
import { t } from "@/i18n/messages";
import { formatSeconds } from "@/lib/format";

export type LibraryClip = {
  id: string;
  status: string;
  style: string;
  title: string;
  score: number;
  source: string;
  duration: number;
  thumbnailUrl: string | null;
  downloadUrl: string;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function LibraryGrid({ clips }: { clips: LibraryClip[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Browsers block many simultaneous downloads: trigger them one by one.
  async function downloadSelection() {
    setBusy(true);
    for (const clip of clips.filter((c) => selected.has(c.id))) {
      const a = document.createElement("a");
      a.href = clip.downloadUrl;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await wait(600);
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6">
      <div className="flex min-h-11 flex-wrap items-center gap-3" aria-live="polite">
        {selected.size > 0 && (
          <>
            <button type="button" className={buttonClass("primary")} disabled={busy} onClick={downloadSelection}>
              <DownloadSimple size={18} aria-hidden="true" />
              {t("library.downloadSelection", { count: selected.size })}
            </button>
            <button type="button" className={buttonClass("ghost")} onClick={() => setSelected(new Set())}>
              {t("library.clearSelection")}
            </button>
          </>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {clips.map((clip) => (
          <li key={clip.id} className="grid gap-2">
            <div className="relative">
              <Link href={`/app/clips/${clip.id}`} className="block overflow-hidden rounded-2xl bg-ink">
                {clip.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived
                  <img src={clip.thumbnailUrl} alt="" width={270} height={480} loading="lazy"
                    className="aspect-[9/16] w-full object-cover" />
                ) : (
                  <div className="aspect-[9/16] w-full" />
                )}
                <span className="sr-only">{clip.title}</span>
              </Link>
              <span className={cx("absolute right-2 top-2 rounded-full px-2 py-0.5 font-mono text-xs font-bold", scoreTone(clip.score))}>
                {Math.round(clip.score)}
              </span>
              <label className="absolute left-2 top-2 flex size-9 items-center justify-center rounded-full bg-paper/90">
                <input type="checkbox" className="size-4 accent-gold" checked={selected.has(clip.id)}
                  onChange={() => toggle(clip.id)} aria-label={`${t("library.select")} : ${clip.title}`} />
              </label>
            </div>
            <Link href={`/app/clips/${clip.id}`} className="line-clamp-2 text-sm font-medium hover:underline">{clip.title}</Link>
            <p className="flex flex-wrap gap-x-2 text-xs text-muted">
              <span>{t(`clip.status.${clip.status}`)}</span>
              <span aria-hidden="true">·</span>
              <span>{styleName(t(`upload.style.${clip.style}`))}</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{formatSeconds(Math.round(clip.duration))}</span>
            </p>
            <p className="truncate text-xs text-muted" title={clip.source}>{clip.source}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
