"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/auth/fields";
import { t } from "@/i18n/messages";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Reached through the emailed recovery link (/auth/callback signs the user in first).
export default function ResetPasswordPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: String(form.get("password")) });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    router.replace("/app");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.reset.title")}</h1>
      <form onSubmit={submit} className="grid gap-5">
        <Field label={t("auth.password")} type="password" name="password" autoComplete="new-password"
          minLength={10} help={t("auth.passwordHelp")} />
        <FormMessage error={error} />
        <SubmitButton label={t("auth.reset.submit")} busy={busy} />
      </form>
    </div>
  );
}
