import Stripe from "stripe";
import { env } from "./env";
import { supabaseAdmin } from "./supabase-admin";

// Stripe billing. Checkout and the customer portal are hosted by Stripe; the webhook is the only
// writer of subscription state (through the sync_subscription database function).

export const PAID_PLANS = ["creator", "pro", "studio"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

let client: Stripe | undefined;

export function stripe(): Stripe {
  if (!client) {
    const e = env();
    if (e.BILLING_PROVIDER === "fake" && e.APP_ENV !== "development") {
      throw new Error("BILLING_PROVIDER=fake is only allowed with APP_ENV=development");
    }
    // Fake mode never calls the API: the client is only used to sign and verify webhooks.
    const key = e.BILLING_PROVIDER === "fake" ? "sk_test_local_fake" : e.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key, { appInfo: { name: "pepite" } });
  }
  return client;
}

export function webhookSecret(): string {
  const e = env();
  if (e.STRIPE_WEBHOOK_SECRET) return e.STRIPE_WEBHOOK_SECRET;
  if (e.BILLING_PROVIDER === "fake" && e.APP_ENV === "development") return "whsec_local_fake_billing";
  throw new Error("STRIPE_WEBHOOK_SECRET is not set");
}

/** Snapshot of a subscription, as stored by sync_subscription. */
export type SubscriptionState = {
  userId: string | null;
  customerId: string;
  subscriptionId: string;
  lookupKey: string | null;
  status: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

export function subscriptionState(sub: Stripe.Subscription): SubscriptionState {
  // Since API 2025-03-31, billing periods live on subscription items, not on the subscription.
  const item = sub.items.data[0];
  const end = item?.current_period_end;
  return {
    userId: sub.metadata?.user_id || null,
    customerId: idOf(sub.customer)!,
    subscriptionId: sub.id,
    lookupKey: item?.price?.lookup_key ?? null,
    status: sub.status,
    periodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  };
}

export type BillingStore = {
  alreadyProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string): Promise<void>;
  planForLookupKey(lookupKey: string): Promise<string | null>;
  userForCustomer(customerId: string): Promise<string | null>;
  linkCustomer(userId: string, customerId: string): Promise<void>;
  sync(state: SubscriptionState & { userId: string; planId: string }, eventAt: Date): Promise<{ plan?: string; stale?: boolean }>;
};

export type HandleResult = { handled: boolean; detail?: string };

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/** Applies one verified Stripe event. Idempotent: a redelivered event is ignored. */
export async function handleStripeEvent(event: Stripe.Event, store: BillingStore): Promise<HandleResult> {
  if (await store.alreadyProcessed(event.id)) return { handled: false, detail: "duplicate" };
  let result: HandleResult = { handled: false, detail: "ignored" };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = idOf(session.customer);
    if (session.mode === "subscription" && session.client_reference_id && customerId) {
      await store.linkCustomer(session.client_reference_id, customerId);
      result = { handled: true, detail: "customer linked" };
    }
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const state = subscriptionState(event.data.object as Stripe.Subscription);
    const userId = state.userId ?? (await store.userForCustomer(state.customerId));
    if (!userId) throw new Error(`No user for customer ${state.customerId}`); // Stripe retries
    const planId = state.lookupKey ? await store.planForLookupKey(state.lookupKey) : null;
    if (!planId) throw new Error(`Unknown price lookup key ${state.lookupKey}`);
    const out = await store.sync({ ...state, userId, planId }, new Date(event.created * 1000));
    result = { handled: true, detail: out.stale ? "stale" : `plan ${out.plan}` };
  }
  // invoice.payment_failed needs no action here: the subscription turns past_due (event above)
  // and Stripe sends its own payment reminder emails.

  await store.markProcessed(event.id, event.type);
  return result;
}

export function supabaseBillingStore(): BillingStore {
  const db = supabaseAdmin();
  const must = <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    async alreadyProcessed(id) {
      const data = must(await db.from("stripe_events").select("id").eq("id", id).maybeSingle());
      return Boolean(data);
    },
    async markProcessed(id, type) {
      must(await db.from("stripe_events").upsert({ id, type }, { onConflict: "id", ignoreDuplicates: true }));
    },
    async planForLookupKey(key) {
      const data = must(await db.from("plans").select("id").eq("stripe_lookup_key", key).maybeSingle());
      return data?.id ?? null;
    },
    async userForCustomer(customerId) {
      const data = must(await db.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle());
      return data?.id ?? null;
    },
    async linkCustomer(userId, customerId) {
      must(await db.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId).is("stripe_customer_id", null));
    },
    async sync(s, eventAt) {
      const data = must(
        await db.rpc("sync_subscription", {
          p_user: s.userId,
          p_customer: s.customerId,
          p_subscription: s.subscriptionId,
          p_plan: s.planId,
          p_status: s.status,
          p_period_end: s.periodEnd,
          p_cancel_at_period_end: s.cancelAtPeriodEnd,
          p_event_at: eventAt.toISOString(),
        }),
      ) as { ok: boolean; plan?: string; stale?: boolean; reason?: string };
      if (!data.ok) throw new Error(`sync_subscription: ${data.reason}`);
      return data;
    },
  };
}
