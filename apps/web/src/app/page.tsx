import { UploadForm } from "@/components/upload-form";
import { t } from "@/i18n/messages";

export default function Home() {
  return (
    <main className="mx-auto grid max-w-2xl gap-8 px-4 py-16">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("upload.heading")}</h1>
        <p className="max-w-[65ch] text-zinc-600 dark:text-zinc-400">{t("upload.lead")}</p>
      </header>
      <UploadForm />
    </main>
  );
}
