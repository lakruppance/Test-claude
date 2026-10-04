import { TiktokLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import { AccountForm } from "@/components/account-form";
import { BillingPanel, type BillingPlan } from "@/components/billing-panel";
import { QuotaMeter } from "@/components/quota-meter";
import { PageTitle, buttonClass } from "@/components/ui";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

const section = "grid gap-4 border-t border-line pt-8 md:grid-cols-[14rem_1fr] md:gap-10";

export default async function AccountPage({ searchParams }: PageProps<"/app/account">) {
  const user = (await currentUser())!;
  const [account, db] = await Promise.all([getAccount(user.id), supabaseServer()]);
  const [{ data: prefs }, { data: plans }, { data: sub }, params] = await Promise.all([
    db.from("profiles").select("default_style, default_with_hook, stripe_customer_id").eq("id", user.id).single(),
    db.from("plans").select("id, name, price_eur_cents, monthly_minutes, max_video_minutes, watermark, max_channels").order("sort"),
    db.from("subscriptions").select("status, current_period_end, cancel_at_period_end").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    searchParams,
  ]);
  const { plan } = account;
  const billingPlans: BillingPlan[] = (plans ?? []).map(({ price_eur_cents, ...p }) => ({ ...p, price: price_eur_cents / 100 }));
  const notice = params.billing === "success" || params.billing === "canceled" ? params.billing : null;

  return (
    <div className="grid max-w-5xl gap-10">
      <PageTitle title={t("account.title")} lead={account.email ?? undefined} />

      <section className={section} aria-labelledby="account-profile">
        <h2 id="account-profile" className="font-display text-xl font-bold">{t("account.profile")}</h2>
        <AccountForm
          displayName={account.displayName ?? ""}
          defaultStyle={prefs?.default_style ?? "impact"}
          defaultWithHook={prefs?.default_with_hook ?? true}
        />
      </section>

      <section id="abonnement" className={`${section} scroll-mt-24`} aria-labelledby="account-plan">
        <h2 id="account-plan" className="font-display text-xl font-bold">{t("account.plan")}</h2>
        <div className="grid gap-4">
          <p>{t("account.planLine", { plan: plan.name, minutes: plan.monthly_minutes, max: plan.max_video_minutes })}</p>
          <QuotaMeter account={account} />
          <BillingPanel
            plans={billingPlans}
            currentPlanId={plan.id}
            subscription={sub ?? null}
            hasCustomer={Boolean(prefs?.stripe_customer_id)}
            highlight={typeof params.plan === "string" ? params.plan : null}
            notice={notice}
          />
        </div>
      </section>

      <section className={section} aria-labelledby="account-connections">
        <h2 id="account-connections" className="font-display text-xl font-bold">{t("account.connections")}</h2>
        <div className="grid gap-4">
          <p className="text-sm text-muted">{t("account.connectionsSoon")}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[{ name: "YouTube", Icon: YoutubeLogo }, { name: "TikTok", Icon: TiktokLogo }].map(({ name, Icon }) => (
              <li key={name} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
                <span className="flex items-center gap-3 font-medium"><Icon size={24} aria-hidden="true" />{name}</span>
                <button type="button" disabled className={buttonClass("secondary", "sm")}>{t("account.soon")}</button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={section}>
        <span aria-hidden="true" />
        <form action="/auth/signout" method="post">
          <button type="submit" className={buttonClass("danger")}>{t("account.signout")}</button>
        </form>
      </section>
    </div>
  );
}
