import { CloudArrowUp, LinkSimple } from "@phosphor-icons/react/dist/ssr";
import { DetectedVideos, type DetectedVideo } from "@/components/channels-manager";
import { JobsList, type JobSummary } from "@/components/jobs-list";
import { QuotaMeter } from "@/components/quota-meter";
import { ButtonLink, PageTitle } from "@/components/ui";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export default async function Dashboard() {
  const user = (await currentUser())!;
  const [account, db] = await Promise.all([getAccount(user.id), supabaseServer()]);
  const [{ data: jobs }, { data: detected }, { count: toReview }] = await Promise.all([
    db.from("jobs")
      .select("id, source_filename, status, progress, error_code, created_at, clips(count)")
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("channel_videos").select("id, title, youtube_video_id, published_at").eq("status", "new")
      .order("published_at", { ascending: false }).limit(10),
    db.from("clips").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
  ]);
  const initial: JobSummary[] = (jobs ?? []).map(({ clips, ...job }) => ({
    ...job,
    clip_count: (clips as unknown as { count: number }[])[0]?.count ?? 0,
  }));

  if (initial.length === 0) {
    return (
      <div className="grid gap-10">
        <PageTitle title={t("onboarding.title")} lead={t("onboarding.lead")} />
        <div className="grid gap-4 md:grid-cols-2">
          <a href="/app/new" className="group grid content-between gap-10 rounded-2xl bg-gold p-8 text-on-gold transition active:scale-[0.99]">
            <CloudArrowUp size={36} aria-hidden="true" />
            <span className="font-display text-2xl font-bold">{t("onboarding.file")}</span>
          </a>
          <a href="/app/new?mode=link" className="group grid content-between gap-10 rounded-2xl border border-line bg-surface p-8 transition active:scale-[0.99]">
            <LinkSimple size={36} aria-hidden="true" />
            <span className="font-display text-2xl font-bold">{t("onboarding.link")}</span>
          </a>
        </div>
        <ol className="grid gap-6 border-t border-line pt-8 md:grid-cols-3">
          {["onboarding.step1", "onboarding.step2", "onboarding.step3"].map((key, i) => (
            <li key={key} className="flex gap-3">
              <span className="font-mono text-sm text-muted">{i + 1}</span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
        <QuotaMeter account={account} />
      </div>
    );
  }

  return (
    <div className="grid gap-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title={t("dashboard.title")} />
        <ButtonLink href="/app/new">{t("nav.new")}</ButtonLink>
      </div>
      <dl className="grid gap-6 border-y border-line py-6 sm:grid-cols-3">
        <div className="grid gap-1">
          <dt className="text-sm text-muted">{t("dashboard.toReview")}</dt>
          <dd className="font-mono text-3xl font-bold">
            <a href="/app/library?status=pending_review" className="hover:underline">{toReview ?? 0}</a>
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm text-muted">{t("dashboard.minutesLeft")}</dt>
          <dd className="font-mono text-3xl font-bold">{Math.floor(account.minutesRemaining)}</dd>
        </div>
        <div className="grid content-end"><QuotaMeter account={account} /></div>
      </dl>
      {(detected ?? []).length > 0 && (
        <section className="grid gap-4">
          <h2 className="font-display text-xl font-bold">{t("channels.newVideos")}</h2>
          <DetectedVideos videos={detected as DetectedVideo[]} />
        </section>
      )}
      <section className="grid gap-4">
        <h2 className="font-display text-xl font-bold">{t("dashboard.videos")}</h2>
        <JobsList userId={user.id} initial={initial} />
      </section>
    </div>
  );
}
