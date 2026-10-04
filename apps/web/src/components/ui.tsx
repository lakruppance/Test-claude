import Link from "next/link";

// Shared UI primitives. Shape rule (docs/design/marque.md): buttons pill, cards 16px, inputs 10px.
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const BUTTON = {
  primary: "bg-gold text-on-gold hover:brightness-95",
  secondary: "border border-line bg-surface text-ink hover:bg-paper",
  ghost: "text-ink hover:bg-line/50",
  danger: "border border-line bg-surface text-danger hover:bg-paper",
} as const;

export function buttonClass(variant: keyof typeof BUTTON = "primary", size: "sm" | "md" | "lg" = "md") {
  const sizes = { sm: "h-9 px-4 text-sm", md: "h-11 px-5 text-sm", lg: "h-12 px-7 text-base" };
  return cx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition",
    "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON[variant],
    sizes[size],
  );
}

export function ButtonLink(props: { href: string; variant?: keyof typeof BUTTON; size?: "sm" | "md" | "lg"; children: React.ReactNode; className?: string }) {
  return (
    <Link href={props.href} className={cx(buttonClass(props.variant, props.size), props.className)}>
      {props.children}
    </Link>
  );
}

export const inputClass =
  "w-full rounded-[10px] border border-control bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted";

export function PageTitle({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <header className="grid gap-2">
      <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      {lead && <p className="max-w-[65ch] text-muted">{lead}</p>}
      {children}
    </header>
  );
}

export function scoreTone(score: number) {
  // One hue: grey to gold by score (no rainbow).
  if (score >= 80) return "bg-gold text-on-gold";
  if (score >= 65) return "bg-gold-soft text-ink";
  return "bg-line text-ink";
}

/** Short subtitle style name ("Impact"), without the description in parentheses. */
export function styleName(label: string) {
  return label.split(" (")[0];
}
