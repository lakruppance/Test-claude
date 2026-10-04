import { t } from "@/i18n/messages";

const KNOWN = new Set([
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "weak_password",
  "over_email_send_rate_limit",
]);

// Supabase Auth error codes -> user-facing message (never the raw server message).
export function authErrorMessage(error: { code?: string } | null | undefined): string {
  const code = error?.code ?? "";
  return t(KNOWN.has(code) ? `auth.error.${code}` : "auth.error.default");
}

// Only allow same-site relative redirects after sign-in.
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
