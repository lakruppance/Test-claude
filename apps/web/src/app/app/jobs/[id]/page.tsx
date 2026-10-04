import Link from "next/link";
import { JobView } from "@/components/job-view";
import { t } from "@/i18n/messages";

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  return (
    <div className="grid gap-8">
      <Link href="/app" className="text-sm text-muted underline underline-offset-4">{t("nav.dashboard")}</Link>
      <JobView id={id} />
    </div>
  );
}
