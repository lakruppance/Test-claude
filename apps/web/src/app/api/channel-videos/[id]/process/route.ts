import { NextResponse } from "next/server";
import { getAccount, jobCreationBlocked } from "@/lib/account";
import { processChannelVideo } from "@/lib/channel-poller";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

// "Generate clips" on a detected video.
export async function POST(_request: Request, ctx: RouteContext<"/api/channel-videos/[id]/process">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await supabaseServer();
  const { data: video } = await db
    .from("channel_videos")
    .select("id, youtube_video_id, title, status")
    .eq("id", id)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (video.status === "queued") return NextResponse.json({ error: "already_queued" }, { status: 409 });
  if ((await getAccount(user.id)).minutesRemaining <= 0) {
    return NextResponse.json({ error: "quota_exhausted" }, { status: 402 });
  }
  const blocked = await jobCreationBlocked(user.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });
  const jobId = await processChannelVideo(video.id, user.id, video.youtube_video_id, video.title);
  return NextResponse.json({ jobId });
}
