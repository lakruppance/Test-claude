"use client";

import { t } from "@/i18n/messages";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function GoogleButton({ next }: { next: string }) {
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") return null;
  const signIn = () =>
    supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  return (
    <>
      <button type="button" onClick={signIn}
        className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold dark:border-zinc-700">
        {t("auth.google")}
      </button>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">{t("auth.or")}</p>
    </>
  );
}
