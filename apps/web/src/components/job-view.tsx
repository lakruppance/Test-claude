"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n/messages";
import type { CostSummary } from "@/lib/costs";

type Clip = {
  id: string;
  segment_id: string;
  style: string;
  reframe_mode: string;
  duration_seconds: number;
  download_url: string;
  thumbnail_url: string | null;
};

type Segment = {
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
};

type JobPayload = {
  job: {
    status: string;
    source_filename: string | null;
    progress: number;
    current_step: string | null;
    error_code: string | null;
    duration_seconds: number | null;
  };
  steps: { step: string; status: string; attempts: number }[];
  segments: Segment[];
  clips: Clip[];
  segments_json_url: string | null;
  costs: CostSummary;
};

const STEPS = ["prepare", "transcribe", "detect", "render"];
const TERMINAL = new Set(["succeeded", "failed", "canceled"]);
const usd = (n: number) => `${n.toFixed(4)} $`;
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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
      timer = setTimeout(load, 3000);
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (missing) return <p>{t("job.notFound")}</p>;
  if (!data) return <p aria-busy="true" className="text-zinc-600 dark:text-zinc-400">{t("job.loading")}</p>;

  const { job, steps, segments, clips, costs } = data;
  const stepStatus = new Map(steps.map((s) => [s.step, s.status]));
  const segmentById = new Map(segments.map((s) => [s.id, s]));

  return (
    <div className="grid gap-10">
      <section className="grid gap-4" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">{job.source_filename}</p>
          <p className="text-sm">{t(`job.status.${job.status}`)} : {Math.round(job.progress)} %</p>
        </div>
        <progress max={100} value={job.progress} className="h-2 w-full accent-emerald-600" />
        <ol className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step} className={stepStatus.get(step) === "succeeded" ? "text-emerald-700 dark:text-emerald-400" : stepStatus.get(step) === "failed" ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}>
              {t(`job.step.${step}`)}
            </li>
          ))}
        </ol>
        {job.status === "failed" && (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {t(`error.${job.error_code ?? "default"}`)}
          </p>
        )}
      </section>

      {clips.length > 0 && (
        <section className="grid gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">{t("job.clips")}</h2>
            {data.segments_json_url && (
              <a href={data.segments_json_url} className="text-sm font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400">
                {t("job.segmentsJson")}
              </a>
            )}
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {clips
              .map((clip) => ({ clip, seg: segmentById.get(clip.segment_id) }))
              .sort((a, b) => (a.seg?.rank ?? 0) - (b.seg?.rank ?? 0))
              .map(({ clip, seg }) => (
                <article key={clip.id} className="grid content-start gap-3">
                  <video controls preload="metadata" poster={clip.thumbnail_url ?? undefined} src={clip.download_url}
                    className="aspect-[9/16] w-full rounded-xl bg-zinc-900 object-cover" />
                  {seg && (
                    <div className="grid gap-1 text-sm">
                      <p className="font-semibold">{seg.titre_propose}</p>
                      <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {time(seg.start_seconds)} - {time(seg.end_seconds)} | score {seg.score_global} | hook {seg.hook} | autonomie {seg.autonomie} | intensité {seg.intensite} | chute {seg.chute}
                      </p>
                      <p className="text-zinc-700 dark:text-zinc-300">{seg.justification}</p>
                    </div>
                  )}
                  <a href={clip.download_url} className="justify-self-start rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
                    {t("job.download")}
                  </a>
                </article>
              ))}
          </div>
        </section>
      )}

      {costs.events.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">{t("job.costs")}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm md:max-w-md">
            {Object.entries(costs.by_provider).map(([provider, value]) => (
              <div key={provider} className="contents">
                <dt>{provider}</dt>
                <dd className="text-right">{usd(value)}</dd>
              </div>
            ))}
            <dt className="font-semibold">{t("job.costTotal")}</dt>
            <dd className="text-right font-semibold">{usd(costs.total_usd)}</dd>
            {costs.per_source_minute_usd !== null && (
              <>
                <dt>{t("job.costPerMinute")}</dt>
                <dd className="text-right">{usd(costs.per_source_minute_usd)}</dd>
              </>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
