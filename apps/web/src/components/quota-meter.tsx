import { t } from "@/i18n/messages";
import type { Account } from "@/lib/account";
import { formatMinutes } from "@/lib/format";

export function QuotaMeter({ account }: { account: Account }) {
  const { minutesUsed, plan } = account;
  const ratio = plan.monthly_minutes ? Math.min(minutesUsed / plan.monthly_minutes, 1) : 1;
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        {t("dashboard.quota", { used: formatMinutes(minutesUsed), limit: plan.monthly_minutes, plan: plan.name })}
      </p>
      <meter min={0} max={1} value={ratio} low={0.7} high={0.9} optimum={0} className="h-2 w-full max-w-md"
        aria-label={t("dashboard.quota", { used: Math.round(minutesUsed), limit: plan.monthly_minutes, plan: plan.name })} />
    </div>
  );
}
