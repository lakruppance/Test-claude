import { notFound, redirect } from "next/navigation";
import { FakeBillingActions } from "@/components/fake-billing";
import { fakeBillingEnabled } from "@/lib/billing-fake";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const metadata = { title: "Paiement simulé" };
export const dynamic = "force-dynamic";

// Stands in for Stripe Checkout and the customer portal in local development.
export default async function FakeBillingPage({ searchParams }: PageProps<"/dev/billing">) {
  if (!fakeBillingEnabled()) notFound();
  const user = await currentUser();
  if (!user) redirect("/login?next=/dev/billing");
  const { plan } = await searchParams;
  const db = supabaseAdmin();
  const [{ data: plans }, { data: sub }] = await Promise.all([
    db.from("plans").select("id, name, price_eur_cents").neq("id", "free").order("sort"),
    db.from("subscriptions").select("plan_id, status, cancel_at_period_end").eq("user_id", user.id)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return (
    <main id="contenu" className="mx-auto grid w-full max-w-xl gap-6 px-4 py-16">
      <p className="rounded-2xl border border-dashed border-control p-4 text-sm">
        Mode local : aucun paiement réel. Cette page remplace Stripe et envoie au webhook les mêmes
        événements signés que Stripe enverrait.
      </p>
      <FakeBillingActions
        plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name, price: p.price_eur_cents / 100 }))}
        selected={typeof plan === "string" ? plan : null}
        subscription={sub ?? null}
      />
    </main>
  );
}
