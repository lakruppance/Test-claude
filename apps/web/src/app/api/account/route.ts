import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

const body = z.object({
  displayName: z.string().trim().max(80).optional(),
  locale: z.enum(["fr", "en"]).optional(),
  defaultStyle: z.enum(["impact", "boite", "epure"]).optional(),
  defaultWithHook: z.boolean().optional(),
});

// Profile preferences. Written through the user's session: RLS + column grants only allow
// these fields (never plan or admin flag).
export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { displayName, locale, defaultStyle, defaultWithHook } = parsed.data;
  const patch = Object.fromEntries(
    Object.entries({
      display_name: displayName,
      locale,
      default_style: defaultStyle,
      default_with_hook: defaultWithHook,
    }).filter(([, v]) => v !== undefined),
  );
  const db = await supabaseServer();
  const { error } = await db.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: "database_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
