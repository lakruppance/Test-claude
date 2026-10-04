import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Approve / reject a clip. Ownership is checked by reading it through the user's session (RLS).
export async function PATCH(request: Request, ctx: RouteContext<"/api/clips/[id]">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = z
    .object({ status: z.enum(["approved", "rejected", "pending_review"]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const db = await supabaseServer();
  const { data: clip } = await db.from("clips").select("id, status").eq("id", id).maybeSingle();
  if (!clip) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (clip.status === "rendering") return NextResponse.json({ error: "rendering" }, { status: 409 });
  await supabaseAdmin()
    .from("clips")
    .update({ status: parsed.data.status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
