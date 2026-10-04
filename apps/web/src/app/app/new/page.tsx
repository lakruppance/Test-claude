import { UploadForm } from "@/components/upload-form";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export default async function NewVideoPage({ searchParams }: PageProps<"/app/new">) {
  const user = (await currentUser())!;
  const [account, { mode }, db] = await Promise.all([getAccount(user.id), searchParams, supabaseServer()]);
  const { data: prefs } = await db.from("profiles").select("default_style, default_with_hook").eq("id", user.id).single();
  return (
    <div className="grid max-w-2xl gap-8">
      <header className="grid gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("upload.heading")}</h1>
        <p className="max-w-[65ch] text-muted">{t("upload.lead")}</p>
        <p className="text-sm">
          {t("upload.remaining", {
            minutes: Math.floor(account.minutesRemaining),
            max: account.plan.max_video_minutes,
          })}
        </p>
      </header>
      <UploadForm
        initialMode={mode === "link" ? "link" : "file"}
        defaultStyle={prefs?.default_style}
        defaultWithHook={prefs?.default_with_hook}
      />
    </div>
  );
}
