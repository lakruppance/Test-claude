import { describe, expect, it } from "vitest";
import { snapBounds } from "./snap";

const words = Array.from({ length: 200 }, (_, i) => ({ text: `w${i}`, start: i * 0.5, end: i * 0.5 + 0.4 }));

describe("snapBounds", () => {
  it("snaps to word boundaries with a little air", () => {
    expect(snapBounds(words, 10.2, 40.1, 120)).toEqual({ start: 9.85, end: 40.75 }) // the word spanning 10.2 s is kept whole;
  });
  it("refuses clips that are too short, too long or inverted", () => {
    expect(snapBounds(words, 10, 12, 120)).toEqual({ error: "too_short" });
    expect(snapBounds(words, 50, 40, 120)).toEqual({ error: "invalid_bounds" });
    const long = Array.from({ length: 1000 }, (_, i) => ({ text: "w", start: i * 0.5, end: i * 0.5 + 0.4 }));
    expect(snapBounds(long, 0, 300, 600)).toEqual({ error: "too_long" });
  });
  it("never goes past the source duration", () => {
    const r = snapBounds(words, 80, 200, 99.9);
    expect("end" in r && r.end).toBeLessThanOrEqual(99.9);
  });
});
