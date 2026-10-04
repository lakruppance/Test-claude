import { BRAND } from "@/lib/brand";

// Geometric mark: a 9:16 frame whose top-right corner is cut like a gem facet, the facet filled
// with the accent. Simple single mark (allowed by the design skill); frame follows text color.
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 24" className={className} aria-hidden="true" focusable="false">
      <path d="M5 2h4l5 5v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10.2 1.6 14.4 5.8 14.4 1.6Z" fill="var(--gold)" />
      <path d="M6 15.5h4M6 12.5h5" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="font-display text-xl font-bold tracking-tight">{BRAND.name}</span>
    </span>
  );
}
