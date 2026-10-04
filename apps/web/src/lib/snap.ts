// Snap requested clip bounds to word boundaries so a clip never starts or ends mid-word.
export type TimedWord = { text: string; start: number; end: number };

export const CLIP_LIMITS = { min: 5, max: 180 }; // YouTube Shorts accept up to 3 minutes
const LEAD_IN = 0.15;
const TAIL_OUT = 0.35;

export function snapBounds(
  words: TimedWord[],
  start: number,
  end: number,
  sourceDuration: number,
): { start: number; end: number } | { error: string } {
  if (!(end > start)) return { error: "invalid_bounds" };
  if (words.length === 0) return { error: "no_transcript" };
  // First word that ends after the requested start; last word that starts before the end.
  const first = words.find((w) => w.end > start) ?? words[words.length - 1];
  const last = [...words].reverse().find((w) => w.start < end) ?? words[0];
  if (last.end <= first.start) return { error: "invalid_bounds" };
  const s = Math.max(0, first.start - LEAD_IN);
  const e = Math.min(sourceDuration || last.end + TAIL_OUT, last.end + TAIL_OUT);
  const duration = e - s;
  if (duration < CLIP_LIMITS.min) return { error: "too_short" };
  if (duration > CLIP_LIMITS.max) return { error: "too_long" };
  return { start: Math.round(s * 1000) / 1000, end: Math.round(e * 1000) / 1000 };
}
