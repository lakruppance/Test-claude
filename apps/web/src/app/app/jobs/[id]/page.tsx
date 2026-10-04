import Link from "next/link";
import { JobView } from "@/components/job-view";
import { t } from "@/i18n/messages";

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  return (
    <div className="grid gap-8">
      <nav aria-label={t("common.breadcrumb")} className="text-sm text-muted">
        <Link href="/app" className="underline underline-offset-4">{t("nav.dashboard")}</Link>
      </nav>
      <JobView id={id} />
    </div>
  );
}
