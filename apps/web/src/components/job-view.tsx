"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { scoreTone } from "@/components/ui";
import { t } from "@/i18n/messages";
import type { CostSummary } from "@/lib/costs";
import { subscribeToRows } from "@/lib/realtime";

type Clip = {
  id: string;
  segment_id: string;
  style: string;
  status: string;
  thumbnail_url: string | null;
};

type Segment = {
  id: string;
  rank: number;
  start_seconds: number;
  end_seconds: number;
  score_global: number;
  titre_propose: string;
  justification: string;
};

type JobPayload = {
  job: {
    status: string;
    source_filename: string | null;
    progress: number;
    error_code: string | null;
    duration_seconds: number | null;
  };
  steps: { step: string; status: string }[];
  segments: Segment[];
  clips: Clip[];
  segments_json_url: string | null;
  transcript: { start: number; end: number; text: string }[];
  costs: CostSummary | null;
};

const STEPS = ["prepare", "transcribe", "detect", "render"];
const TERMINAL = new Set(["succeeded", "failed", "canceled"]);
// Link imports that failed for reasons only a direct upload can work around.
const UPLOAD_INSTEAD = new Set(["youtube_blocked", "video_age_restricted", "file_not_shared", "youtube_disabled"]);
const usd = (n: number) => `${n.toFixed(4)} $`;
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function JobView({ id }: { id: string }) {
  const [data, setData] = useState<JobPayload | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const load = async () => {
      const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!active) return;
      if (res.status === 404) return setMissing(true);
      if (res.ok) {
        const payload = (await res.json()) as JobPayload;
        setData(payload);
        if (TERMINAL.has(payload.job.status)) return;
      }
      timer = setTimeout(load, 10000); // fallback if Realtime is unavailable
    };
    load();
    const unsubscribe = subscribeToRows(`job-${id}`, "jobs", `id=eq.${id}`, () => {
      clearTimeout(timer);
      void load();
    });
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [id]);

  if (missing) return <p>{t("job.notFound")}</p>;
  if (!data) {
    return (
      <div aria-busy="true" className="grid gap-4">
        <div className="h-6 w-1/3 animate-pulse rounded bg-line" />
        <div className="h-2 w-full animate-pulse rounded bg-line" />
        <div className="h-40 w-full animate-pulse rounded-2xl bg-line" />
      </div>
    );
  }

  const { job, steps, segments, clips, costs, transcript } = data;
  const stepStatus = new Map(steps.map((s) => [s.step, s.status]));
  const duration = Number(job.duration_seconds ?? 0);
  const clipBySegment = new Map(clips.map((c) => [c.segment_id, c]));
  const inSegment = (s: { start: number; end: number }) =>
    segments.some((seg) => s.start < seg.end_seconds && s.end > seg.start_seconds);

  return (
    <div className="grid gap-12">
      <section className="grid gap-4" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold">{job.source_filename}</h2>
          <p className="text-sm">
            {t(`job.status.${job.status}`)}
            {job.status !== "succeeded" && job.status !== "failed" && <> : <span className="font-mono">{Math.round(job.progress)} %</span></>}
          </p>
        </div>
        {job.status !== "succeeded" && (
          <>
            <progress max={100} value={job.progress} className="h-2 w-full accent-gold" />
            <ol className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              {STEPS.map((step) => (
                <li key={step} className={stepStatus.get(step) === "succeeded" ? "font-semibold" : stepStatus.get(step) === "failed" ? "text-danger" : "text-muted"}>
                  {t(`job.step.${step}`)}
                </li>
              ))}
            </ol>
          </>
        )}
        {job.status === "failed" && (
          <div role="alert" className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
            <p className="text-danger">{t(`error.${job.error_code ?? "default"}`)}</p>
            {job.error_code && UPLOAD_INSTEAD.has(job.error_code) && (
              <Link href="/app/new" className="justify-self-start text-sm font-semibold underline underline-offset-4">{t("error.uploadInstead")}</Link>
            )}
          </div>
        )}
      </section>

      {segments.length > 0 && duration > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-xl font-bold">{t("video.timeline")}</h2>
          <p className="text-sm text-muted">{t("video.timelineHelp")}</p>
          <div className="relative h-12 rounded-xl bg-line">
            {segments.map((seg) => {
              const clip = clipBySegment.get(seg.id);
              const style = {
                left: `${(seg.start_seconds / duration) * 100}%`,
                width: `${Math.max(((seg.end_seconds - seg.start_seconds) / duration) * 100, 0.8)}%`,
                opacity: 0.3 + Math.max(0, seg.score_global - 50) / 70,
              };
              const label = `${seg.titre_propose}, ${clock(seg.start_seconds)} à ${clock(seg.end_seconds)}, score ${seg.score_global}`;
              return clip ? (
                <Link key={seg.id} href={`/app/clips/${clip.id}`} aria-label={label} title={label} className="absolute top-1.5 h-9 rounded-lg bg-gold hover:ring-2 hover:ring-ink" style={style} />
              ) : (
                <span key={seg.id} title={label} className="absolute top-1.5 h-9 rounded-lg bg-gold" style={style} />
              );
            })}
          </div>
          <div className="flex justify-between font-mono text-xs text-muted"><span>0:00</span><span>{clock(duration)}</span></div>
        </section>
      )}

      <section className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{t("video.clips")}</h2>
          {data.segments_json_url && (
            <a href={data.segments_json_url} className="text-sm font-semibold underline underline-offset-4">{t("job.segmentsJson")}</a>
          )}
        </div>
        {clips.length === 0 ? (
          <p className="text-sm text-muted">{t("video.noClips")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
            {segments.filter((s) => clipBySegment.has(s.id)).map((seg) => {
              const clip = clipBySegment.get(seg.id)!;
              return (
                <li key={clip.id}>
                  <Link href={`/app/clips/${clip.id}`} className="group grid gap-2">
                    <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-line">
                      {clip.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={clip.thumbnail_url} alt="" width={270} height={480} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                      )}
                      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${scoreTone(seg.score_global)}`}>{seg.score_global}</span>
                    </div>
                    <span className="line-clamp-2 text-sm font-semibold">{seg.titre_propose}</span>
                    <span className="text-xs text-muted">{t(`clip.status.${clip.status}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {transcript.length > 0 && (
        <section className="grid gap-4">
          <h2 className="font-display text-xl font-bold">{t("video.transcript")}</h2>
          <div className="max-h-[480px] overflow-y-auto rounded-2xl border border-line bg-surface p-6">
            <p className="max-w-[75ch] leading-relaxed">
              {transcript.map((s) => (
                <span key={s.start} className={inSegment(s) ? "rounded bg-gold-soft" : undefined}>
                  <span className="mr-1 font-mono text-xs text-muted">{clock(s.start)}</span>
                  {s.text}{" "}
                </span>
              ))}
            </p>
          </div>
        </section>
      )}

      {costs && costs.events.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-xl font-bold">{t("job.costs")}</h2>
          <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
            {Object.entries(costs.by_provider).map(([provider, value]) => (
              <div key={provider} className="contents"><dt>{provider}</dt><dd className="text-right">{usd(value)}</dd></div>
            ))}
            <dt className="font-semibold">{t("job.costTotal")}</dt>
            <dd className="text-right font-semibold">{usd(costs.total_usd)}</dd>
            {costs.per_source_minute_usd !== null && (
              <><dt>{t("job.costPerMinute")}</dt><dd className="text-right">{usd(costs.per_source_minute_usd)}</dd></>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
