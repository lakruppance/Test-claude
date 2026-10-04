import { ChannelsManager, DetectedVideos, type ChannelItem, type DetectedVideo } from "@/components/channels-manager";
import { Broadcast } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export default async function ChannelsPage() {
  const user = (await currentUser())!;
  const [account, db] = await Promise.all([getAccount(user.id), supabaseServer()]);
  const [{ data: channels }, { data: videos }] = await Promise.all([
    db.from("channels").select("id, title, youtube_channel_id, auto_process, last_checked_at, last_error").order("created_at"),
    db.from("channel_videos").select("id, title, youtube_video_id, published_at").eq("status", "new").order("published_at", { ascending: false }).limit(50),
  ]);
  const count = channels?.length ?? 0;
  const { plan } = account;

  return (
    <div className="grid max-w-4xl gap-10">
      <header className="grid gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("channels.title")}</h1>
        <p className="max-w-[65ch] text-muted">{t("channels.lead")}</p>
        {plan.channel_monitoring && <p className="text-sm">{t("channels.limit", { count, max: plan.max_channels })}</p>}
      </header>
      {!plan.channel_monitoring && count === 0 ? (
        <section className="grid justify-items-start gap-4 rounded-2xl border border-line bg-surface p-8">
          <Broadcast size={32} aria-hidden="true" />
          <p className="max-w-[55ch]">{t("channels.locked")}</p>
          <ButtonLink href="/app/account#abonnement">{t("channels.seePlans")}</ButtonLink>
        </section>
      ) : (
        <>
          <ChannelsManager
            channels={(channels ?? []) as ChannelItem[]}
            canAdd={plan.channel_monitoring && count < plan.max_channels}
            canAutoProcess={plan.channel_monitoring}
          />
          <section className="grid gap-4">
            <h2 className="font-display text-xl font-bold">{t("channels.newVideos")}</h2>
            <DetectedVideos videos={(videos ?? []) as DetectedVideo[]} />
          </section>
        </>
      )}
    </div>
  );
}
