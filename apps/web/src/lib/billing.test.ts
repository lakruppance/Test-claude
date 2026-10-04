import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { handleStripeEvent, subscriptionState, type BillingStore, type SubscriptionState } from "./billing";

const stripe = new Stripe("sk_test_unit", {});
const SECRET = "whsec_unit_test_secret";

function sub(over: Partial<{ status: string; lookup: string; user: string | null; cancel: boolean }> = {}) {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: over.status ?? "active",
    cancel_at_period_end: over.cancel ?? false,
    cancel_at: null,
    metadata: over.user === null ? {} : { user_id: over.user ?? "user-1" },
    items: { object: "list", data: [{ current_period_start: 1_790_000_000, current_period_end: 1_792_592_000, price: { lookup_key: over.lookup ?? "pepite_pro_monthly" } }] },
  } as unknown as Stripe.Subscription;
}

const event = (type: string, object: unknown, id = "evt_1", created = 1_790_000_100) =>
  ({ id, object: "event", type, created, data: { object } }) as unknown as Stripe.Event;

function memoryStore() {
  const processed = new Set<string>();
  const synced: (SubscriptionState & { planId: string; userId: string })[] = [];
  const linked: [string, string][] = [];
  const store: BillingStore = {
    alreadyProcessed: async (id) => processed.has(id),
    markProcessed: async (id) => void processed.add(id),
    planForLookupKey: async (key) => ({ pepite_creator_monthly: "creator", pepite_pro_monthly: "pro", pepite_studio_monthly: "studio" })[key] ?? null,
    userForCustomer: async (c) => (c === "cus_1" ? "user-from-customer" : null),
    linkCustomer: async (u, c) => void linked.push([u, c]),
    sync: async (s) => {
      synced.push(s);
      return { plan: s.planId };
    },
  };
  return { store, processed, synced, linked };
}

describe("webhook signature", () => {
  const payload = JSON.stringify(event("customer.subscription.updated", sub()));

  it("accepts a correctly signed payload", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(stripe.webhooks.constructEvent(payload, header, SECRET).id).toBe("evt_1");
  });

  it("rejects a tampered payload, a wrong secret and an old timestamp", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(() => stripe.webhooks.constructEvent(payload.replace("pro", "studio"), header, SECRET)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
    const old = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(() => stripe.webhooks.constructEvent(payload, old, SECRET)).toThrow();
  });
});

describe("subscriptionState", () => {
  it("reads the billing period from the subscription item", () => {
    const s = subscriptionState(sub({ cancel: true }));
    expect(s).toMatchObject({ userId: "user-1", customerId: "cus_1", lookupKey: "pepite_pro_monthly", cancelAtPeriodEnd: true });
    expect(s.periodEnd).toBe(new Date(1_792_592_000 * 1000).toISOString());
  });
});

describe("handleStripeEvent", () => {
  it("syncs a subscription with the plan of its price", async () => {
    const m = memoryStore();
    const out = await handleStripeEvent(event("customer.subscription.created", sub()), m.store);
    expect(out).toEqual({ handled: true, detail: "plan pro" });
    expect(m.synced[0]).toMatchObject({ userId: "user-1", planId: "pro", status: "active" });
    expect(m.processed.has("evt_1")).toBe(true);
  });

  it("ignores a redelivered event", async () => {
    const m = memoryStore();
    await handleStripeEvent(event("customer.subscription.updated", sub()), m.store);
    const again = await handleStripeEvent(event("customer.subscription.updated", sub()), m.store);
    expect(again.detail).toBe("duplicate");
    expect(m.synced).toHaveLength(1);
  });

  it("finds the user through the Stripe customer when metadata is missing", async () => {
    const m = memoryStore();
    await handleStripeEvent(event("customer.subscription.deleted", sub({ user: null, status: "canceled" })), m.store);
    expect(m.synced[0]).toMatchObject({ userId: "user-from-customer", status: "canceled" });
  });

  it("fails (so Stripe retries) on an unknown price, without marking the event processed", async () => {
    const m = memoryStore();
    await expect(handleStripeEvent(event("customer.subscription.updated", sub({ lookup: "nope" })), m.store)).rejects.toThrow();
    expect(m.processed.size).toBe(0);
  });

  it("links the customer when a subscription checkout completes", async () => {
    const m = memoryStore();
    const session = { mode: "subscription", client_reference_id: "user-9", customer: "cus_9" };
    await handleStripeEvent(event("checkout.session.completed", session, "evt_2"), m.store);
    expect(m.linked).toEqual([["user-9", "cus_9"]]);
  });

  it("acknowledges unrelated events without side effects", async () => {
    const m = memoryStore();
    const out = await handleStripeEvent(event("invoice.payment_failed", {}, "evt_3"), m.store);
    expect(out.handled).toBe(false);
    expect(m.synced).toHaveLength(0);
    expect(m.processed.has("evt_3")).toBe(true);
  });
});
