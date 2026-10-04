#!/usr/bin/env node
// Creates or updates, in the Stripe account of STRIPE_SECRET_KEY:
//   - one product and one monthly EUR price per paid plan, found by lookup key (tax-inclusive);
//   - the default customer portal configuration (plan switch, cancellation, invoices);
//   - optionally the webhook endpoint (--webhook-url https://.../api/stripe/webhook).
// Safe to run again: existing objects are reused; a changed price creates a new price that takes
// over the lookup key (existing subscribers keep their price until they change plan).
//
// Usage (from apps/web): STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs [--webhook-url URL] [--live]
import Stripe from "stripe";

const PLANS = [
  { id: "creator", name: "Pépite Créateur", amount: 1900, lookup: "pepite_creator_monthly" },
  { id: "pro", name: "Pépite Pro", amount: 4900, lookup: "pepite_pro_monthly" },
  { id: "studio", name: "Pépite Studio", amount: 12900, lookup: "pepite_studio_monthly" },
];
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.payment_failed",
];

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1] ?? true;
};
const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY (test mode key sk_test_... first).");
if (key.startsWith("sk_live_") && !flag("--live")) throw new Error("Live key: add --live to confirm.");
const stripe = new Stripe(key);

async function findProduct(planId) {
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata?.plan_id === planId) return product;
  }
  return null;
}

const priceIds = [];
for (const plan of PLANS) {
  const product =
    (await findProduct(plan.id)) ??
    (await stripe.products.create({ name: plan.name, metadata: { plan_id: plan.id } }));
  const [existing] = (await stripe.prices.list({ lookup_keys: [plan.lookup], active: true, limit: 1 })).data;
  const same =
    existing &&
    existing.unit_amount === plan.amount &&
    existing.currency === "eur" &&
    existing.recurring?.interval === "month" &&
    existing.tax_behavior === "inclusive";
  const price = same
    ? existing
    : await stripe.prices.create({
        product: product.id,
        currency: "eur",
        unit_amount: plan.amount,
        recurring: { interval: "month" },
        tax_behavior: "inclusive", // displayed prices include VAT
        lookup_key: plan.lookup,
        transfer_lookup_key: true,
        metadata: { plan_id: plan.id },
      });
  priceIds.push({ product: product.id, prices: [price.id] });
  console.log(`${plan.id}: product ${product.id}, price ${price.id} (${same ? "reused" : "created"})`);
}

const features = {
  customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    products: priceIds,
    proration_behavior: "create_prorations", // upgrades: charged pro rata right away
    schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }] }, // downgrades: at renewal
  },
};
const [portal] = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data;
if (portal) {
  await stripe.billingPortal.configurations.update(portal.id, { features });
  console.log(`portal: default configuration ${portal.id} updated`);
} else {
  const created = await stripe.billingPortal.configurations.create({ features });
  console.log(`portal: configuration ${created.id} created`);
}

const webhookUrl = flag("--webhook-url");
if (typeof webhookUrl === "string") {
  const endpoints = (await stripe.webhookEndpoints.list({ limit: 100 })).data;
  const found = endpoints.find((e) => e.url === webhookUrl);
  if (found) {
    await stripe.webhookEndpoints.update(found.id, { enabled_events: EVENTS });
    console.log(`webhook: ${found.id} updated (its signing secret is unchanged)`);
  } else {
    const created = await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: EVENTS });
    // Shown once by Stripe: store it directly as STRIPE_WEBHOOK_SECRET in the hosting platform.
    console.log(`webhook: ${created.id} created. Signing secret (store it as STRIPE_WEBHOOK_SECRET, do not share it):`);
    console.log(created.secret);
  }
}
