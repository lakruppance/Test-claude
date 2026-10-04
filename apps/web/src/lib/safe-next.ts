// Only same-site paths: never redirect to another origin ("//evil", "/\\evil").
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
