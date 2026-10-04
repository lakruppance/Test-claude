import { JobsList, type JobSummary } from "@/components/jobs-list";
import { QuotaMeter } from "@/components/quota-meter";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export default async function Dashboard() {
  const user = (await currentUser())!;
  const [account, db] = await Promise.all([getAccount(user.id), supabaseServer()]);
  const { data: jobs } = await db
    .from("jobs")
    .select("id, source_filename, status, progress, error_code, created_at, clips(count)")
    .order("created_at", { ascending: false })
    .limit(50);
  const initial: JobSummary[] = (jobs ?? []).map(({ clips, ...job }) => ({
    ...job,
    clip_count: (clips as unknown as { count: number }[])[0]?.count ?? 0,
  }));
  const toReview = initial.filter((j) => j.status === "succeeded").reduce((n, j) => n + j.clip_count, 0);

  return (
    <div className="grid gap-10">
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <QuotaMeter account={account} />
        {toReview > 0 && <p className="text-sm">{t("dashboard.clipsReady", { count: toReview })}</p>}
      </section>
      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">{t("dashboard.videos")}</h2>
        <JobsList userId={user.id} initial={initial} />
      </section>
    </div>
  );
}
