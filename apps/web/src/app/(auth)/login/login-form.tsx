"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/auth/fields";
import { GoogleButton } from "@/components/auth/google-button";
import { t } from "@/i18n/messages";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const target = safeNext(next);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    router.replace(target);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t("auth.login.title")}</h1>
      <GoogleButton next={target} />
      <form onSubmit={submit} className="grid gap-5">
        <Field label={t("auth.email")} type="email" name="email" autoComplete="email" />
        <Field label={t("auth.password")} type="password" name="password" autoComplete="current-password" />
        <FormMessage error={error} />
        <SubmitButton label={t("auth.login.submit")} busy={busy} />
      </form>
      <div className="grid gap-2 text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">{t("auth.login.forgot")}</Link>
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="underline underline-offset-4">{t("auth.login.noAccount")}</Link>
      </div>
    </div>
  );
}
