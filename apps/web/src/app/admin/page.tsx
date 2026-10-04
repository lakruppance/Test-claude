import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const usd = (n: number) => `${n.toFixed(4)} $`;
const date = formatDateTime;
const th = "px-3 py-2 text-left font-medium";
const td = "px-3 py-2 align-top";

// Internal admin. Access: profiles.is_admin, set by an operator in the database (never by users).
export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await getAccount(user.id)).isAdmin) notFound();

  const db = supabaseAdmin();
  const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [profiles, usage, failed, recent, jobCounts] = await Promise.all([
    db.from("profiles").select("id, email, plan_id, created_at").order("created_at", { ascending: false }).limit(200),
    db.from("usage_events").select("user_id, minutes").eq("period_start", periodStart.toISOString().slice(0, 10)),
    db.from("jobs")
      .select("id, user_id, source_filename, current_step, error_code, error_message, finished_at, job_steps(step, status, attempts, error_message)")
      .eq("status", "failed").order("finished_at", { ascending: false }).limit(50),
    db.from("jobs")
      .select("id, user_id, source_filename, status, duration_seconds, cost_usd, created_at")
      .in("status", ["succeeded", "failed"]).order("created_at", { ascending: false }).limit(100),
    db.from("jobs").select("user_id"),
  ]);

  const emailOf = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));
  const minutesByUser = new Map<string, number>();
  for (const u of usage.data ?? []) minutesByUser.set(u.user_id, (minutesByUser.get(u.user_id) ?? 0) + Number(u.minutes));
  const jobsByUser = new Map<string, number>();
  for (const j of jobCounts.data ?? []) jobsByUser.set(j.user_id, (jobsByUser.get(j.user_id) ?? 0) + 1);

  const monthJobs = (recent.data ?? []).filter((j) => new Date(j.created_at) >= periodStart);
  const monthCost = monthJobs.reduce((s, j) => s + Number(j.cost_usd), 0);
  const monthMinutes = monthJobs.reduce((s, j) => s + Number(j.duration_seconds ?? 0) / 60, 0);

  return (
    <main id="contenu" className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-10">
      <header className="grid gap-2">
        <Link href="/app" className="text-sm underline underline-offset-4">{t("nav.dashboard")}</Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("admin.title")}</h1>
      </header>

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold">{t("admin.month")}</h2>
        <dl className="grid grid-cols-1 gap-4 font-mono text-sm sm:grid-cols-3">
          <div><dt className="text-muted">{t("admin.totalCost")}</dt><dd className="text-lg">{usd(monthCost)}</dd></div>
          <div><dt className="text-muted">{t("admin.totalMinutes")}</dt><dd className="text-lg">{monthMinutes.toFixed(1)}</dd></div>
          <div><dt className="text-muted">{t("admin.avgPerMinute")}</dt><dd className="text-lg">{monthMinutes ? usd(monthCost / monthMinutes) : "-"}</dd></div>
        </dl>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold">{t("admin.failedJobs")}</h2>
        {(failed.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t("admin.noFailures")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr><th className={th}>{t("admin.col.date")}</th><th className={th}>{t("admin.col.user")}</th><th className={th}>{t("admin.col.file")}</th><th className={th}>{t("admin.col.step")}</th><th className={th}>{t("admin.col.error")}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(failed.data ?? []).map((job) => {
                  const steps = (job.job_steps ?? []) as { step: string; status: string; attempts: number; error_message: string | null }[];
                  const step = steps.find((s) => s.status === "failed");
                  return (
                    <tr key={job.id}>
                      <td className={td}>{date(job.finished_at)}</td>
                      <td className={td}>{emailOf.get(job.user_id) ?? job.user_id}</td>
                      <td className={td}>{job.source_filename}</td>
                      <td className={td}>{step ? `${step.step} (${step.attempts}x)` : job.current_step}</td>
                      <td className={`${td} font-mono text-xs`}>{job.error_code}: {(step?.error_message ?? job.error_message ?? "").slice(0, 300)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold">{t("admin.costs")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr><th className={th}>{t("admin.col.date")}</th><th className={th}>{t("admin.col.user")}</th><th className={th}>{t("admin.col.file")}</th><th className={th}>{t("admin.col.duration")}</th><th className={th}>{t("admin.col.cost")}</th><th className={th}>{t("admin.col.perMinute")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line font-mono">
              {(recent.data ?? []).map((job) => {
                const minutes = Number(job.duration_seconds ?? 0) / 60;
                return (
                  <tr key={job.id}>
                    <td className={td}>{date(job.created_at)}</td>
                    <td className={td}>{emailOf.get(job.user_id) ?? job.user_id}</td>
                    <td className={td}><Link href={`/app/jobs/${job.id}`} className="underline underline-offset-4">{job.source_filename}</Link></td>
                    <td className={td}>{minutes.toFixed(1)} min</td>
                    <td className={td}>{usd(Number(job.cost_usd))}</td>
                    <td className={td}>{minutes ? usd(Number(job.cost_usd) / minutes) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold">{t("admin.users")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr><th className={th}>{t("admin.col.email")}</th><th className={th}>{t("admin.col.plan")}</th><th className={th}>{t("admin.col.minutes")}</th><th className={th}>{t("admin.col.jobs")}</th><th className={th}>{t("admin.col.created")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(profiles.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td className={td}>{p.email}</td>
                  <td className={td}>{p.plan_id}</td>
                  <td className={`${td} font-mono`}>{(minutesByUser.get(p.id) ?? 0).toFixed(1)}</td>
                  <td className={`${td} font-mono`}>{jobsByUser.get(p.id) ?? 0}</td>
                  <td className={td}>{date(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
