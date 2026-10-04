"use client";

import { Check } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass, cx } from "@/components/ui";
import { t } from "@/i18n/messages";
import { formatDate } from "@/lib/format";

export type BillingPlan = {
  id: string;
  name: string;
  price: number;
  monthly_minutes: number;
  max_video_minutes: number;
  watermark: boolean;
  max_channels: number;
};
export type BillingSubscription = { status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null;

const LIVE = new Set(["active", "trialing", "past_due"]);

async function go(endpoint: string, body?: object) {
  const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error("billing_unavailable");
  const { url } = (await res.json()) as { url: string };
  window.location.assign(url);
}

export function BillingPanel(props: {
  plans: BillingPlan[];
  currentPlanId: string;
  subscription: BillingSubscription;
  hasCustomer: boolean;
  highlight: string | null;
  notice: "success" | "canceled" | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const sub = props.subscription;
  const live = Boolean(sub && LIVE.has(sub.status));
  const current = props.plans.find((p) => p.id === props.currentPlanId);

  // After checkout the webhook may land a few seconds later: refresh until the plan shows up.
  useEffect(() => {
    if (props.notice !== "success" || live) return;
    let n = 0;
    const id = setInterval(() => (++n > 15 ? clearInterval(id) : router.refresh()), 2000);
    return () => clearInterval(id);
  }, [props.notice, live, router]);

  async function run(key: string, endpoint: string, body?: object) {
    setBusy(key);
    setError(false);
    try {
      await go(endpoint, body);
    } catch {
      setError(true);
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      {props.notice === "success" && (
        <p role="status" className="rounded-2xl bg-gold-soft p-4 text-sm">{live ? t("billing.active", { plan: current?.name ?? "" }) : t("billing.pending")}</p>
      )}
      {props.notice === "canceled" && <p role="status" className="rounded-2xl border border-line p-4 text-sm">{t("billing.canceled")}</p>}

      {sub?.status === "past_due" && (
        <div role="alert" className="grid justify-items-start gap-3 rounded-2xl border border-danger p-4">
          <p className="text-sm">{t("billing.pastDue")}</p>
          <button type="button" className={buttonClass("primary", "sm")} disabled={busy !== null} onClick={() => run("portal", "/api/billing/portal")}>
            {t("billing.updatePayment")}
          </button>
        </div>
      )}
      {live && sub?.current_period_end && sub.status !== "past_due" && (
        <p className="text-sm">
          {sub.cancel_at_period_end
            ? t("billing.endsOn", { plan: current?.name ?? "", date: formatDate(sub.current_period_end) })
            : t("billing.renewsOn", { date: formatDate(sub.current_period_end) })}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {props.plans.map((plan) => {
          const isCurrent = plan.id === props.currentPlanId;
          const highlighted = !isCurrent && plan.id === props.highlight;
          return (
            <li key={plan.id} className={cx("grid content-between gap-4 rounded-2xl border p-5", isCurrent ? "border-ink" : highlighted ? "border-gold shadow-[0_0_0_1px_var(--gold)]" : "border-line bg-surface")}>
              <div className="grid gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-bold">{plan.name}</h3>
                  <p><span className="font-display text-2xl font-extrabold">{plan.price}&nbsp;€</span><span className="text-sm text-muted"> {t("billing.perMonth")}</span></p>
                </div>
                <ul className="grid gap-1 text-sm text-muted">
                  <li>{t("billing.feature.minutes", { minutes: plan.monthly_minutes })}</li>
                  <li>{t("billing.feature.maxVideo", { max: plan.max_video_minutes })}</li>
                  <li>{plan.watermark ? t("billing.feature.watermark") : t("billing.feature.noWatermark")}</li>
                  {plan.max_channels > 0 && <li>{t(plan.max_channels > 1 ? "billing.feature.channels" : "billing.feature.channel", { count: plan.max_channels })}</li>}
                </ul>
              </div>
              {isCurrent ? (
                <p className="inline-flex items-center gap-2 text-sm font-semibold"><Check size={16} weight="bold" aria-hidden="true" />{t("billing.current")}</p>
              ) : plan.id === "free" ? (
                live && (
                  <button type="button" className={buttonClass("secondary", "sm")} disabled={busy !== null} onClick={() => run(`p-${plan.id}`, "/api/billing/portal")}>
                    {busy === `p-${plan.id}` ? `${t("billing.backToFree")}…` : t("billing.backToFree")}
                  </button>
                )
              ) : (
                <button type="button" className={buttonClass(highlighted ? "primary" : "secondary", "sm")} disabled={busy !== null}
                  onClick={() => (live ? run(`p-${plan.id}`, "/api/billing/portal") : run(`p-${plan.id}`, "/api/billing/checkout", { plan: plan.id }))}>
                  {busy === `p-${plan.id}` ? `${t(live ? "billing.change" : "billing.upgrade", { plan: plan.name })}…` : t(live ? "billing.change" : "billing.upgrade", { plan: plan.name })}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {props.hasCustomer && (
        <button type="button" className={`${buttonClass("ghost", "sm")} justify-self-start`} disabled={busy !== null} onClick={() => run("portal", "/api/billing/portal")}>
          {t("billing.manage")}
        </button>
      )}
      <p className="text-sm text-muted">{t("billing.note")}</p>
      {error && <p role="alert" className="text-sm text-danger">{t("billing.error")}</p>}
    </div>
  );
}
