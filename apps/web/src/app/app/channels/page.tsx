import { ChannelsManager, DetectedVideos, type ChannelItem, type DetectedVideo } from "@/components/channels-manager";
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
        <h1 className="text-3xl font-semibold tracking-tight">{t("channels.title")}</h1>
        <p className="max-w-[65ch] text-zinc-600 dark:text-zinc-400">{t("channels.lead")}</p>
        {plan.channel_monitoring ? (
          <p className="text-sm">{t("channels.limit", { count, max: plan.max_channels })}</p>
        ) : (
          <p className="text-sm">{t("channels.locked")}</p>
        )}
      </header>
      <ChannelsManager
        channels={(channels ?? []) as ChannelItem[]}
        canAdd={plan.channel_monitoring && count < plan.max_channels}
        canAutoProcess={plan.channel_monitoring}
      />
      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">{t("channels.newVideos")}</h2>
        <DetectedVideos videos={(videos ?? []) as DetectedVideo[]} />
      </section>
    </div>
  );
}
