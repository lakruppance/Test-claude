import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { handleStripeEvent, stripe, supabaseBillingStore, webhookSecret } from "@/lib/billing";

// Stripe → subscription state. The raw body is needed for the signature check.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, webhookSecret());
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  try {
    const result = await handleStripeEvent(event, supabaseBillingStore());
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    // 500: Stripe retries the delivery later.
    console.error("stripe webhook", event.type, event.id, error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
