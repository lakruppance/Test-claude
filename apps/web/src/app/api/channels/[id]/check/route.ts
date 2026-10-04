import { NextResponse } from "next/server";
import { pollChannel, type ChannelRow } from "@/lib/channel-poller";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

// "Check now" button. Limited to one check every 2 minutes per channel.
export async function POST(_request: Request, ctx: RouteContext<"/api/channels/[id]/check">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await supabaseServer();
  const { data: channel } = await db
    .from("channels")
    .select("id, user_id, youtube_channel_id, auto_process, last_checked_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (channel.last_checked_at && Date.now() - Date.parse(channel.last_checked_at) < 120_000) {
    return NextResponse.json({ error: "too_soon" }, { status: 429 });
  }
  return NextResponse.json(await pollChannel(channel as ChannelRow));
}
