import { Skeleton } from "@/components/state-pages";
import { t } from "@/i18n/messages";

export default function AppLoading() {
  return (
    <div className="grid gap-10" role="status" aria-label={t("state.loading")}>
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-6 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}
