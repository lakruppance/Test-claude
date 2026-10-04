import { NextResponse } from "next/server";
import { z } from "zod";
import { PAID_PLANS } from "@/lib/billing";
import { checkoutUrl } from "@/lib/billing-sessions";
import { currentUser } from "@/lib/supabase/server";

const body = z.object({ plan: z.enum(PAID_PLANS) });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    return NextResponse.json({ url: await checkoutUrl({ id: user.id, email: user.email ?? null }, parsed.data.plan) });
  } catch (error) {
    console.error("checkout", error);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}
