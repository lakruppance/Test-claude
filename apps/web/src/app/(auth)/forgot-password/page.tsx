"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/auth/fields";
import { t } from "@/i18n/messages";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(String(form.get("email")), {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    // Same message whether or not the account exists (no account enumeration).
    if (error && error.code === "over_email_send_rate_limit") return setError(authErrorMessage(error));
    setSent(true);
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.forgot.title")}</h1>
      {sent ? (
        <FormMessage info={t("auth.forgot.sent")} />
      ) : (
        <form onSubmit={submit} className="grid gap-5">
          <Field label={t("auth.email")} type="email" name="email" autoComplete="email" />
          <FormMessage error={error} />
          <SubmitButton label={t("auth.forgot.submit")} busy={busy} />
        </form>
      )}
      <Link href="/login" className="text-sm underline underline-offset-4">{t("auth.signup.hasAccount")}</Link>
    </div>
  );
}
