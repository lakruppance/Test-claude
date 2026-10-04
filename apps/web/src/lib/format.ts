// Dates rendered on both server and client: a fixed time zone keeps the two outputs identical
// (no hydration mismatch). Users are in France for now; per-user time zones come with i18n.
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? DATE_TIME.format(new Date(iso)) : "";
}

const SECONDS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** "25,4 s" with a non-breaking space, so the unit never wraps alone. */
export function formatSeconds(seconds: number): string {
  return `${SECONDS.format(seconds)} s`;
}

export function formatMinutes(minutes: number): string {
  return SECONDS.format(minutes);
}
