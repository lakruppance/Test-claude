"use client";

import { Check, Copy, DownloadSimple, ArrowCounterClockwise, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { buttonClass, scoreTone, styleName } from "@/components/ui";
import { t } from "@/i18n/messages";
import { formatSeconds } from "@/lib/format";
import { subscribeToRows } from "@/lib/realtime";

export type ReviewData = {
  id: string;
  status: string;
  style: string;
  withHook: boolean;
  renderError: string | null;
  videoUrl: string;
  downloadUrl: string;
  posterUrl: string | null;
  segment: {
    id: string;
    rank: number;
    start_seconds: number;
    end_seconds: number;
    score_global: number;
    hook: number;
    autonomie: number;
    intensite: number;
    chute: number;
    justification: string;
    titre_propose: string;
    accroche_ecran: string;
    original_start_seconds: number | null;
    original_end_seconds: number | null;
    platform_meta: {
      youtube?: { title: string; description: string; hashtags: string[] };
      tiktok?: { caption: string; hashtags: string[] };
    };
  };
  window: { start: number; end: number };
  words: { text: string; start: number; end: number }[];
};

const STYLES = ["impact", "boite", "epure"] as const;
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function StylePreview({ style }: { style: string }) {
  if (style === "impact") return <span className="whitespace-nowrap font-display text-xs font-extrabold uppercase text-white sm:text-sm [text-shadow:0_0_3px_#000]">Le <span className="text-gold">mot</span> fort</span>;
  if (style === "boite") return <span className="whitespace-nowrap rounded bg-black/60 px-1.5 text-xs font-semibold text-white sm:text-base">Le <span className="text-[#3ddc84]">mot</span> clé</span>;
  return <span className="whitespace-nowrap text-xs font-semibold text-white/60 sm:text-sm">Le <span className="text-white">mot</span> discret</span>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs hover:bg-line/50"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? t("review.copied") : t("review.copy")}
        </button>
      </div>
      <p className="whitespace-pre-wrap rounded-[10px] border border-line bg-paper p-3 text-sm">{value}</p>
    </div>
  );
}

export function ClipReview({ data }: { data: ReviewData }) {
  const router = useRouter();
  const ids = { start: useId(), end: useId(), hook: useId() };
  const seg = data.segment;
  const [start, setStart] = useState(Number(seg.start_seconds));
  const [end, setEnd] = useState(Number(seg.end_seconds));
  const [style, setStyle] = useState(data.style);
  const [withHook, setWithHook] = useState(data.withHook);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(data.renderError ? t(`review.error.${data.renderError}`) : null);

  useEffect(
    () => subscribeToRows(`clip-${data.id}`, "clips", `id=eq.${data.id}`, () => router.refresh()),
    [data.id, router],
  );

  const span = data.window.end - data.window.start;
  const pct = (s: number) => ((s - data.window.start) / span) * 100;
  const selectedText = useMemo(
    () => data.words.filter((w) => w.start >= start - 0.2 && w.end <= end + 0.4).map((w) => w.text).join(" "),
    [data.words, start, end],
  );
  const changed = start !== Number(seg.start_seconds) || end !== Number(seg.end_seconds) || style !== data.style || withHook !== data.withHook;
  const rendering = data.status === "rendering";

  useEffect(() => {
    if (!changed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  async function send(url: string, body: object, method = "POST") {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "default";
      setError(t(`review.error.${code}`) === `review.error.${code}` ? t("auth.error.default") : t(`review.error.${code}`));
      return false;
    }
    router.refresh();
    return true;
  }

  const meta = seg.platform_meta ?? {};
  const scores: [string, number][] = [
    [t("review.criteria.hook"), seg.hook],
    [t("review.criteria.standalone"), seg.autonomie],
    [t("review.criteria.intensity"), seg.intensite],
    [t("review.criteria.ending"), seg.chute],
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div className="grid content-start gap-4 lg:sticky lg:top-24">
        <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-[#0e0f10]">
          <video key={data.videoUrl} controls playsInline preload="metadata" poster={data.posterUrl ?? undefined} src={data.videoUrl} className="h-full w-full" />
          {rendering && (
            <div className="absolute inset-0 grid place-items-center bg-[#0e0f10]/75 p-6 text-center text-sm text-white" role="status">{t("review.rendering")}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={data.downloadUrl} className={buttonClass("secondary", "md")}><DownloadSimple size={18} aria-hidden="true" />{t("review.download")}</a>
        </div>
      </div>

      <div className="grid content-start gap-10">
        <header className="grid gap-3">
          <p className="text-sm text-muted">{t(`clip.status.${data.status}`)}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{seg.titre_propose}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {data.status !== "approved" && (
              <button type="button" disabled={busy || rendering} className={buttonClass("primary")} onClick={() => send(`/api/clips/${data.id}`, { status: "approved" }, "PATCH")}>
                <Check size={18} aria-hidden="true" />{t("review.approve")}
              </button>
            )}
            {data.status !== "rejected" && (
              <button type="button" disabled={busy || rendering} className={buttonClass("danger")} onClick={() => send(`/api/clips/${data.id}`, { status: "rejected" }, "PATCH")}>
                <X size={18} aria-hidden="true" />{t("review.reject")}
              </button>
            )}
            {(data.status === "approved" || data.status === "rejected") && (
              <button type="button" disabled={busy} className={buttonClass("ghost")} onClick={() => send(`/api/clips/${data.id}`, { status: "pending_review" }, "PATCH")}>
                <ArrowCounterClockwise size={18} aria-hidden="true" />{t("review.restore")}
              </button>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </header>

        <section className="grid gap-4 border-t border-line pt-6">
          <h2 className="font-display text-xl font-bold">{t("review.score")}</h2>
          <div className="flex flex-wrap items-center gap-6">
            <span className={`rounded-2xl px-4 py-2 font-mono text-4xl font-bold ${scoreTone(seg.score_global)}`}>{seg.score_global}</span>
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {scores.map(([label, value]) => (
                <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-mono text-xl font-bold">{value}</dd></div>
              ))}
            </dl>
          </div>
          <div className="grid gap-1">
            <h3 className="text-sm font-medium">{t("review.why")}</h3>
            <p className="max-w-[65ch] text-muted">{seg.justification}</p>
          </div>
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h2 className="font-display text-xl font-bold">{t("review.trim")}</h2>
          <p className="text-sm text-muted">{t("review.trimHelp")}</p>
          <div className="relative h-10 rounded-xl bg-line" aria-hidden="true">
            {seg.original_start_seconds !== null && (
              <span className="absolute top-0 h-10 rounded-xl border-2 border-dashed border-muted/60" style={{ left: `${pct(Number(seg.original_start_seconds))}%`, width: `${pct(Number(seg.original_end_seconds)) - pct(Number(seg.original_start_seconds))}%` }} />
            )}
            <span className="absolute top-1 h-8 rounded-lg bg-gold" style={{ left: `${pct(start)}%`, width: `${Math.max(pct(end) - pct(start), 0.5)}%` }} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label htmlFor={ids.start} className="flex justify-between text-sm font-medium"><span>{t("review.start")}</span><span className="font-mono">{clock(start)}</span></label>
              <input id={ids.start} type="range" min={data.window.start} max={data.window.end} step={0.1} value={start} aria-valuetext={clock(start)}
                onChange={(e) => setStart(Math.min(Number(e.target.value), end - 1))} className="accent-gold" disabled={rendering} />
            </div>
            <div className="grid gap-2">
              <label htmlFor={ids.end} className="flex justify-between text-sm font-medium"><span>{t("review.end")}</span><span className="font-mono">{clock(end)}</span></label>
              <input id={ids.end} type="range" min={data.window.start} max={data.window.end} step={0.1} value={end} aria-valuetext={clock(end)}
                onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 1))} className="accent-gold" disabled={rendering} />
            </div>
          </div>
          <p className="text-sm"><span className="text-muted">{t("review.duration")} : </span><span className="font-mono">{formatSeconds(end - start)}</span></p>
          {selectedText && <p className="max-h-32 max-w-[75ch] overflow-y-auto rounded-[10px] border border-line bg-paper p-3 text-sm text-muted">{selectedText}</p>}
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <fieldset className="grid gap-3">
            <legend className="mb-2 font-display text-xl font-bold">{t("review.style")}</legend>
            <div className="grid grid-cols-3 gap-3">
              {STYLES.map((s) => (
                <label key={s} className={`grid cursor-pointer gap-2 rounded-2xl border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${style === s ? "border-gold shadow-[0_0_0_1px_var(--gold)]" : "border-line"}`}>
                  <input type="radio" name="style" value={s} checked={style === s} onChange={() => setStyle(s)} className="sr-only" disabled={rendering} />
                  <span className="grid h-16 place-items-center overflow-hidden rounded-xl bg-[#2a2c2f]"><StylePreview style={s} /></span>
                  <span className="text-sm font-medium">{styleName(t(`upload.style.${s}`))}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor={ids.hook} className="flex items-center gap-3 text-sm">
            <input id={ids.hook} type="checkbox" checked={withHook} onChange={(e) => setWithHook(e.target.checked)} className="size-4 accent-gold" disabled={rendering} />
            <span>
              {t("review.hook")}
              {seg.accroche_ecran && <span className="text-muted"> : « {seg.accroche_ecran} »</span>}
            </span>
          </label>
          <button type="button" disabled={!changed || busy || rendering} className={`${buttonClass("secondary")} justify-self-start`}
            onClick={() => send(`/api/clips/${data.id}/rerender`, { start, end, style, withHook })}>
            {t("review.regenerate")}
          </button>
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h2 className="font-display text-xl font-bold">{t("review.metadata")}</h2>
          {meta.youtube || meta.tiktok ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="grid content-start gap-4">
                <h3 className="font-semibold">YouTube Shorts</h3>
                <CopyField label={t("review.youtubeTitle")} value={meta.youtube?.title ?? ""} />
                <CopyField label={t("review.youtubeDescription")} value={[meta.youtube?.description, meta.youtube?.hashtags?.join(" ")].filter(Boolean).join("\n\n")} />
              </div>
              <div className="grid content-start gap-4">
                <h3 className="font-semibold">TikTok</h3>
                <CopyField label={t("review.tiktokCaption")} value={[meta.tiktok?.caption, meta.tiktok?.hashtags?.join(" ")].filter(Boolean).join(" ")} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("review.noMetadata")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
