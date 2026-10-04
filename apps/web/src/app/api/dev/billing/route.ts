import { NextResponse } from "next/server";
import { z } from "zod";
import { fakeBillingEnabled, simulate } from "@/lib/billing-fake";
import { currentUser } from "@/lib/supabase/server";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), plan: z.enum(["creator", "pro", "studio"]) }),
  z.object({ action: z.literal("change"), plan: z.enum(["creator", "pro", "studio"]) }),
  z.object({ action: z.literal("cancel_at_period_end") }),
  z.object({ action: z.literal("payment_failed") }),
  z.object({ action: z.literal("end") }),
]);

// Local development only (APP_ENV=development and BILLING_PROVIDER=fake): 404 everywhere else.
export async function POST(request: Request) {
  if (!fakeBillingEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  return NextResponse.json(await simulate(user.id, parsed.data, new URL(request.url).origin));
}
