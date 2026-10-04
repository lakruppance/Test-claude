import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Ownership is checked by reading the channel through the user's session (RLS) first.
async function ownedChannel(id: string) {
  const user = await currentUser();
  if (!user) return { user: null, channel: null };
  const db = await supabaseServer();
  const { data } = await db.from("channels").select("id").eq("id", id).maybeSingle();
  return { user, channel: data };
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/channels/[id]">) {
  const { id } = await ctx.params;
  const { user, channel } = await ownedChannel(id);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = z.object({ autoProcess: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (parsed.data.autoProcess && !(await getAccount(user.id)).plan.channel_monitoring) {
    return NextResponse.json({ error: "channel_limit" }, { status: 402 });
  }
  await supabaseAdmin().from("channels").update({ auto_process: parsed.data.autoProcess }).eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/channels/[id]">) {
  const { id } = await ctx.params;
  const { user, channel } = await ownedChannel(id);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await supabaseAdmin().from("channels").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
