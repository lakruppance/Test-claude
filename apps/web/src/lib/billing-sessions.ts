import { stripe, type PaidPlan } from "./billing";
import { env } from "./env";
import { supabaseAdmin } from "./supabase-admin";

type BillingUser = { id: string; email: string | null };

const appUrl = (path: string) => new URL(path, env().NEXT_PUBLIC_APP_URL).toString();

async function profileBilling(userId: string) {
  const db = supabaseAdmin();
  const [{ data: profile }, { data: subs }] = await Promise.all([
    db.from("profiles").select("stripe_customer_id").eq("id", userId).single(),
    db.from("subscriptions").select("status").eq("user_id", userId),
  ]);
  const active = (subs ?? []).some((s) => ["active", "trialing", "past_due"].includes(s.status));
  return { customerId: profile?.stripe_customer_id ?? null, hasActiveSubscription: active };
}

async function ensureCustomer(user: BillingUser, existing: string | null) {
  if (existing) return existing;
  const customer = await stripe().customers.create(
    { email: user.email ?? undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  // Only set it if still empty (two tabs at once): the first one wins.
  await supabaseAdmin().from("profiles").update({ stripe_customer_id: customer.id }).eq("id", user.id).is("stripe_customer_id", null);
  const { data } = await supabaseAdmin().from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  return data?.stripe_customer_id ?? customer.id;
}

/**
 * URL to send the user to for a paid plan. A user who already pays changes plan in the portal
 * (prorated upgrade, downgrade at period end): never a second subscription.
 */
export async function checkoutUrl(user: BillingUser, plan: PaidPlan): Promise<string> {
  const e = env();
  const billing = await profileBilling(user.id);
  if (billing.hasActiveSubscription) return portalUrl(user);
  if (e.BILLING_PROVIDER === "fake") return `/dev/billing?plan=${plan}`;

  const { data: row } = await supabaseAdmin().from("plans").select("stripe_lookup_key").eq("id", plan).single();
  const prices = await stripe().prices.list({ lookup_keys: [row!.stripe_lookup_key], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No active Stripe price for ${row!.stripe_lookup_key}`);

  const customer = await ensureCustomer(user, billing.customerId);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id, plan_id: plan } },
    allow_promotion_codes: true,
    locale: "fr",
    ...(e.STRIPE_AUTOMATIC_TAX
      ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const }, tax_id_collection: { enabled: true } }
      : {}),
    success_url: appUrl("/app/account?billing=success#abonnement"),
    cancel_url: appUrl("/app/account?billing=canceled#abonnement"),
  });
  return session.url!;
}

/** Stripe customer portal: change plan, cancel, payment method, invoices. */
export async function portalUrl(user: BillingUser): Promise<string> {
  const e = env();
  if (e.BILLING_PROVIDER === "fake") return "/dev/billing";
  const billing = await profileBilling(user.id);
  const customer = await ensureCustomer(user, billing.customerId);
  const session = await stripe().billingPortal.sessions.create({
    customer,
    locale: "fr",
    return_url: appUrl("/app/account#abonnement"),
  });
  return session.url;
}
