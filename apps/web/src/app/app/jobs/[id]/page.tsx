import Link from "next/link";
import { JobView } from "@/components/job-view";
import { t } from "@/i18n/messages";

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <Link href="/app" className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400">
          {t("nav.dashboard")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("job.heading")}</h1>
      </header>
      <JobView id={id} />
    </div>
  );
}
