import { Skeleton } from "@/components/state-pages";
import { t } from "@/i18n/messages";

export default function LibraryLoading() {
  return (
    <div className="grid gap-8" role="status" aria-label={t("state.loading")}>
      <Skeleton className="h-10 w-56" />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}><Skeleton className="aspect-[9/16] w-full" /></li>
        ))}
      </ul>
    </div>
  );
}
