import { ButtonLink, buttonClass } from "@/components/ui";
import { t } from "@/i18n/messages";

// Shared body for error and not-found screens: one message, one way forward.
export function StateMessage(props: { title: string; lead: string; action?: React.ReactNode }) {
  return (
    <div className="grid max-w-xl content-start gap-4 py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{props.title}</h1>
      <p className="text-muted">{props.lead}</p>
      <div className="flex flex-wrap gap-3 pt-2">{props.action}</div>
    </div>
  );
}

export function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <button type="button" className={buttonClass("primary")} onClick={onRetry}>{t("state.retry")}</button>
      <ButtonLink href="/app" variant="secondary">{t("nav.dashboard")}</ButtonLink>
    </>
  );
}

/** Placeholder block for loading skeletons (same radius scale as the real content). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-2xl bg-line/70 ${className}`} />;
}
