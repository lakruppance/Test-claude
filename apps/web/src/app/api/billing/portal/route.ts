import { NextResponse } from "next/server";
import { portalUrl } from "@/lib/billing-sessions";
import { currentUser } from "@/lib/supabase/server";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    return NextResponse.json({ url: await portalUrl({ id: user.id, email: user.email ?? null }) });
  } catch (error) {
    console.error("portal", error);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}
