import { Skeleton } from "@/components/state-pages";
import { t } from "@/i18n/messages";

export default function ClipLoading() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr]" role="status" aria-label={t("state.loading")}>
      <Skeleton className="aspect-[9/16] w-full" />
      <div className="grid content-start gap-6">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-11 w-56" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
