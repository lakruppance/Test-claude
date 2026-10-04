import { getAccount } from "./account";
import { createLinkJob } from "./jobs";
import { supabaseAdmin } from "./supabase-admin";
import { ChannelError, fetchFeed } from "./youtube-feed";

export type ChannelRow = {
  id: string;
  user_id: string;
  youtube_channel_id: string;
  auto_process: boolean;
  last_checked_at: string | null;
  created_at: string;
};

// Checks one channel's RSS feed and records videos not seen before. On the very first check,
// existing videos are recorded as "ignored" so the backlog is never processed by surprise.
// Videos published after the channel was added are "new"; with auto-processing on (and a plan
// that includes it), a clip job is created right away.
export async function pollChannel(channel: ChannelRow): Promise<{ added: number; queued: number }> {
  const db = supabaseAdmin();
  let feed;
  try {
    feed = await fetchFeed(channel.youtube_channel_id);
  } catch (e) {
    const code = e instanceof ChannelError ? e.code : "feed_unavailable";
    await db.from("channels").update({ last_checked_at: new Date().toISOString(), last_error: code }).eq("id", channel.id);
    return { added: 0, queued: 0 };
  }
  const { data: known } = await db
    .from("channel_videos")
    .select("youtube_video_id")
    .eq("channel_id", channel.id);
  const seen = new Set((known ?? []).map((v) => v.youtube_video_id));
  const firstCheck = channel.last_checked_at === null;
  const addedAt = new Date(channel.created_at).getTime();
  const fresh = feed.entries.filter((e) => !seen.has(e.videoId));

  let queued = 0;
  const account = fresh.length ? await getAccount(channel.user_id) : null;
  for (const entry of fresh) {
    const isNew = !firstCheck && Date.parse(entry.published) >= addedAt;
    const { data: row } = await db
      .from("channel_videos")
      .insert({
        channel_id: channel.id,
        user_id: channel.user_id,
        youtube_video_id: entry.videoId,
        title: entry.title.slice(0, 500),
        published_at: entry.published,
        status: isNew ? "new" : "ignored",
      })
      .select("id")
      .single();
    if (row && isNew && channel.auto_process && account?.plan.channel_monitoring && account.minutesRemaining > 0) {
      try {
        await processChannelVideo(row.id, channel.user_id, entry.videoId, entry.title);
        queued++;
      } catch (e) {
        console.error(`auto-process failed for ${entry.videoId}`, e);
      }
    }
  }
  await db.from("channels").update({ last_checked_at: new Date().toISOString(), last_error: null }).eq("id", channel.id);
  return { added: fresh.length, queued };
}

// Creates the clip job for a detected video. Rights are covered by the declaration made when
// the channel was added; the job still gets its own declaration row pointing to the video.
export async function processChannelVideo(channelVideoId: string, userId: string, videoId: string, title: string) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const jobId = await createLinkJob({
    userId,
    kind: "youtube",
    url,
    title,
    style: process.env.CLIP_STYLE_DEFAULT ?? "impact",
    withHook: true,
    rights: { contentKind: "channel", contentRef: url },
  });
  await supabaseAdmin().from("channel_videos").update({ status: "queued", job_id: jobId }).eq("id", channelVideoId);
  return jobId;
}

export async function pollDueChannels(intervalMinutes = Number(process.env.RSS_POLL_INTERVAL_MINUTES ?? 30)) {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - intervalMinutes * 60_000).toISOString();
  const { data } = await db
    .from("channels")
    .select("id, user_id, youtube_channel_id, auto_process, last_checked_at, created_at")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(500);
  let added = 0;
  for (const channel of (data ?? []) as ChannelRow[]) added += (await pollChannel(channel)).added;
  return { channels: data?.length ?? 0, added };
}
