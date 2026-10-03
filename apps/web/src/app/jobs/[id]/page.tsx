import Link from "next/link";
import { JobView } from "@/components/job-view";
import { t } from "@/i18n/messages";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-16">
      <header className="grid gap-2">
        <Link href="/" className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400">
          {t("upload.heading")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("job.heading")}</h1>
      </header>
      <JobView id={id} />
    </main>
  );
}
