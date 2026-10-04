"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

type Sub = { plan_id: string; status: string; cancel_at_period_end: boolean } | null;

export function FakeBillingActions(props: { plans: { id: string; name: string; price: number }[]; selected: string | null; subscription: Sub }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = props.subscription && ["active", "trialing", "past_due"].includes(props.subscription.status);

  // Like Stripe: checkout returns with ?billing=success, the portal returns without it.
  async function send(body: { action: string; plan?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/dev/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return setError(await res.text());
    router.push(body.action === "subscribe" ? "/app/account?billing=success#abonnement" : "/app/account#abonnement");
    router.refresh();
  }

  if (!live) {
    const plan = props.plans.find((p) => p.id === props.selected) ?? props.plans[0];
    return (
      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-6">
        <h1 className="font-display text-2xl font-bold">Abonnement {plan.name}</h1>
        <p className="font-display text-3xl font-extrabold">{plan.price} € <span className="text-base font-normal text-muted">/ mois</span></p>
        <button type="button" disabled={busy} className={buttonClass("primary", "lg")} onClick={() => send({ action: "subscribe", plan: plan.id })}>
          Payer (simulation)
        </button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </section>
    );
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-surface p-6">
      <h1 className="font-display text-2xl font-bold">Gérer l&apos;abonnement (simulation)</h1>
      <p className="text-sm text-muted">Plan actuel : {props.subscription!.plan_id}, statut {props.subscription!.status}{props.subscription!.cancel_at_period_end ? ", résiliation en fin de période" : ""}.</p>
      <div className="flex flex-wrap gap-2">
        {props.plans.filter((p) => p.id !== props.subscription!.plan_id).map((p) => (
          <button key={p.id} type="button" disabled={busy} className={buttonClass("secondary", "sm")} onClick={() => send({ action: "change", plan: p.id })}>
            Passer à {p.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={buttonClass("secondary", "sm")} onClick={() => send({ action: "cancel_at_period_end" })}>Résilier en fin de période</button>
        <button type="button" disabled={busy} className={buttonClass("secondary", "sm")} onClick={() => send({ action: "payment_failed" })}>Simuler un paiement refusé</button>
        <button type="button" disabled={busy} className={buttonClass("danger", "sm")} onClick={() => send({ action: "end" })}>Simuler la fin de l&apos;abonnement</button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
