import type Stripe from "stripe";
import { stripe, webhookSecret } from "./billing";
import { supabaseAdmin } from "./supabase-admin";

// Local-only billing simulation. It builds the same events Stripe would send, signs them with the
// webhook secret and posts them to the real webhook endpoint: the production code path runs.

export function fakeBillingEnabled() {
  return (process.env.APP_ENV ?? "development") === "development" && process.env.BILLING_PROVIDER === "fake";
}

export type FakeAction =
  | { action: "subscribe"; plan: string }
  | { action: "change"; plan: string }
  | { action: "cancel_at_period_end" }
  | { action: "payment_failed" }
  | { action: "end" };

const ids = (userId: string) => ({
  customer: `cus_fake_${userId.slice(0, 8)}`,
  subscription: `sub_fake_${userId.slice(0, 8)}`,
});

function subscription(userId: string, lookupKey: string, status: Stripe.Subscription.Status, cancelAtPeriodEnd: boolean) {
  const { customer, subscription: id } = ids(userId);
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    object: "subscription",
    customer,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: null,
    metadata: { user_id: userId },
    items: {
      object: "list",
      data: [{ id: `si_${id}`, object: "subscription_item", current_period_start: now, current_period_end: now + 30 * 86400, price: { id: `price_${lookupKey}`, object: "price", lookup_key: lookupKey } }],
    },
  } as unknown as Stripe.Subscription;
}

export async function simulate(userId: string, request: FakeAction, origin: string) {
  const db = supabaseAdmin();
  const { subscription: subId } = ids(userId);
  const { data: current } = await db.from("subscriptions").select("plan_id, status").eq("stripe_subscription_id", subId).maybeSingle();
  const lookup = async (plan: string) =>
    (await db.from("plans").select("stripe_lookup_key").eq("id", plan).single()).data?.stripe_lookup_key as string;

  let type: string;
  let object: Stripe.Subscription;
  switch (request.action) {
    case "subscribe":
      type = "customer.subscription.created";
      object = subscription(userId, await lookup(request.plan), "active", false);
      break;
    case "change":
      type = "customer.subscription.updated";
      object = subscription(userId, await lookup(request.plan), "active", false);
      break;
    case "cancel_at_period_end":
      type = "customer.subscription.updated";
      object = subscription(userId, await lookup(current!.plan_id), "active", true);
      break;
    case "payment_failed":
      type = "customer.subscription.updated";
      object = subscription(userId, await lookup(current!.plan_id), "past_due", false);
      break;
    case "end":
      type = "customer.subscription.deleted";
      object = subscription(userId, await lookup(current!.plan_id), "canceled", false);
      break;
  }
  const event = {
    id: `evt_fake_${crypto.randomUUID()}`,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  };
  const payload = JSON.stringify(event);
  const header = stripe().webhooks.generateTestHeaderString({ payload, secret: webhookSecret() });
  const res = await fetch(new URL("/api/stripe/webhook", origin), {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text()}`);
  return res.json();
}
