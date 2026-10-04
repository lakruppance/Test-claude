"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
        <Link href="/app/new" className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-on-gold">
          {t("nav.new")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link href={`/app/jobs/${job.id}`} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="grid gap-1">
              <span className="font-medium">{job.source_filename}</span>
              <span className="text-sm text-muted">
                {formatDateTime(job.created_at)}
                {job.status === "succeeded" && ` | ${t("dashboard.clips", { count: job.clip_count })}`}
                {job.status === "failed" && ` | ${t(`error.${job.error_code ?? "default"}`)}`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {(job.status === "running" || job.status === "queued") && (
                <progress max={100} value={job.progress} className="h-2 w-32 accent-gold" />
              )}
              <span>{t(`job.status.${job.status}`)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
