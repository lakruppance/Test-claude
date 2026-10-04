import { UploadForm } from "@/components/upload-form";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser } from "@/lib/supabase/server";

export default async function NewVideoPage() {
  const user = (await currentUser())!;
  const account = await getAccount(user.id);
  return (
    <div className="grid max-w-2xl gap-8">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("upload.heading")}</h1>
        <p className="max-w-[65ch] text-zinc-600 dark:text-zinc-400">{t("upload.lead")}</p>
        <p className="text-sm">
          {t("upload.remaining", {
            minutes: Math.floor(account.minutesRemaining),
            max: account.plan.max_video_minutes,
          })}
        </p>
      </header>
      <UploadForm />
    </div>
  );
}
