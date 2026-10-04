"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { t } from "@/i18n/messages";
import { subscribeToRows } from "@/lib/realtime";
import { formatDateTime } from "@/lib/format";

export type JobSummary = {
  id: string;
  source_filename: string | null;
  status: string;
  progress: number;
  error_code: string | null;
  created_at: string;
  clip_count: number;
};

// Job list kept current with Supabase Realtime (RLS applies: only the user's own jobs arrive).
export function JobsList({ userId, initial }: { userId: string; initial: JobSummary[] }) {
  const [jobs, setJobs] = useState(initial);

  useEffect(
    () =>
      subscribeToRows(`jobs-${userId}`, "jobs", `user_id=eq.${userId}`, (raw) => {
        const row = raw as Partial<JobSummary> & { id: string };
        setJobs((current) => {
          const existing = current.find((j) => j.id === row.id);
          if (!existing) return [{ clip_count: 0, ...row } as JobSummary, ...current];
          return current.map((j) => (j.id === row.id ? { ...j, ...row } : j));
        });
      }),
    [userId],
  );

  if (jobs.length === 0) {
    return (
      <div className="grid justify-items-start gap-4 rounded-2xl border border-dashed border-line p-8">
        <p className="text-muted">{t("dashboard.empty")}</p>
        <Link href="/app/new" className={buttonClass("primary")}>
          {t("nav.new")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link href={`/app/jobs/${job.id}`} className="-mx-3 grid gap-2 rounded-xl px-3 py-4 transition-colors hover:bg-line/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="grid min-w-0 gap-1">
              <span className="truncate font-medium" title={job.source_filename ?? undefined}>{job.source_filename ?? t("job.untitled")}</span>
              <span className="text-sm text-muted">
                {formatDateTime(job.created_at)}
                {job.status === "succeeded" && ` · ${t("dashboard.clips", { count: job.clip_count })}`}
                {job.status === "failed" && ` · ${t(`error.${job.error_code ?? "default"}`)}`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {(job.status === "running" || job.status === "queued") && (
                <progress max={100} value={job.progress} className="h-2 w-32 accent-gold" aria-label={t("job.progress")} />
              )}
              <span>{t(`job.status.${job.status}`)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
