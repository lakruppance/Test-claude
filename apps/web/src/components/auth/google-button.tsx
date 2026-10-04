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
        className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-surface px-7 font-semibold">
        {t("auth.google")}
      </button>
      <p className="text-center text-sm text-muted">{t("auth.or")}</p>
    </>
  );
}
