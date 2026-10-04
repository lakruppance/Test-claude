"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/auth/fields";
import { GoogleButton } from "@/components/auth/google-button";
import { t } from "@/i18n/messages";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function SignupForm({ next }: { next?: string }) {
  const target = safeNext(next);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    // With email confirmation on, Supabase returns a user with no identities for an existing address.
    if (data.user && data.user.identities?.length === 0) return setError(t("auth.error.user_already_exists"));
    setDone(true);
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t("auth.signup.title")}</h1>
      {done ? (
        <FormMessage info={t("auth.signup.checkEmail")} />
      ) : (
        <>
          <GoogleButton next={target} />
          <form onSubmit={submit} className="grid gap-5">
            <Field label={t("auth.email")} type="email" name="email" autoComplete="email" />
            <Field label={t("auth.password")} type="password" name="password" autoComplete="new-password"
              minLength={10} help={t("auth.passwordHelp")} />
            <FormMessage error={error} />
            <SubmitButton label={t("auth.signup.submit")} busy={busy} />
          </form>
        </>
      )}
      <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-sm underline underline-offset-4">{t("auth.signup.hasAccount")}</Link>
    </div>
  );
}
