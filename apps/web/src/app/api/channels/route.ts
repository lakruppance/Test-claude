import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { pollChannel, type ChannelRow } from "@/lib/channel-poller";
import { recordRights, requestContext } from "@/lib/jobs";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ChannelError, fetchFeed, resolveChannelId } from "@/lib/youtube-feed";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const db = await supabaseServer();
  const { data } = await db.from("channels").select("*").order("created_at");
  return NextResponse.json({ channels: data ?? [] });
}

const body = z.object({
  channel: z.string().min(3).max(300),
  autoProcess: z.boolean().optional(),
  rightsCertified: z.literal(true),
});

// Adds a YouTube channel to monitor. Requires a plan that includes channel monitoring and a
// declaration that the user owns the channel or is authorized by its creator.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const account = await getAccount(user.id);
  const db = supabaseAdmin();
  const { count } = await db.from("channels").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!account.plan.channel_monitoring || (count ?? 0) >= account.plan.max_channels) {
    return NextResponse.json({ error: "channel_limit" }, { status: 402 });
  }

  let channelId: string;
  let title: string;
  try {
    channelId = await resolveChannelId(parsed.data.channel);
    title = (await fetchFeed(channelId)).title || channelId;
  } catch (e) {
    const code = e instanceof ChannelError ? e.code : "feed_unavailable";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const { data: channel, error } = await db
    .from("channels")
    .insert({ user_id: user.id, youtube_channel_id: channelId, title: title.slice(0, 200), auto_process: parsed.data.autoProcess ?? false })
    .select("id, user_id, youtube_channel_id, auto_process, last_checked_at, created_at")
    .single();
  if (error?.code === "23505") return NextResponse.json({ error: "channel_exists" }, { status: 409 });
  if (error || !channel) return NextResponse.json({ error: "database_error" }, { status: 500 });

  await recordRights(user.id, null, {
    contentKind: "channel",
    contentRef: `https://www.youtube.com/channel/${channelId}`,
    ...requestContext(request),
  });
  await pollChannel(channel as ChannelRow); // baseline: existing videos are not processed
  return NextResponse.json({ channel });
}
