import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { checkBasicAuth } from "./basic-auth";
import { summarizeCosts } from "./costs";
import { overallProgress } from "./progress";
import { planParts, sourceKey } from "./storage-keys";

describe("planParts", () => {
  it("uses 16 MiB parts and stays under 10,000 parts", () => {
    expect(planParts(100 * 1024 ** 2)).toEqual({ partSize: 16 * 1024 ** 2, count: 7 });
    const huge = planParts(500 * 1024 ** 3);
    expect(huge.count).toBeLessThanOrEqual(10_000);
  });
  it("rejects empty files", () => expect(() => planParts(0)).toThrow());
});

describe("sourceKey", () => {
  it("prefixes by owner under sources/ and rejects unknown types", () => {
    expect(sourceKey("u1", "j1", "video/mp4")).toBe("sources/u1/j1/source.mp4");
    expect(() => sourceKey("u1", "j1", "application/zip")).toThrow();
  });
});

describe("checkBasicAuth", () => {
  const header = (s: string) => `Basic ${btoa(s)}`;
  it("accepts the right credentials only", () => {
    expect(checkBasicAuth(header("ops:secret"), "ops:secret")).toBe(true);
    expect(checkBasicAuth(header("ops:wrong"), "ops:secret")).toBe(false);
    expect(checkBasicAuth(null, "ops:secret")).toBe(false);
    expect(checkBasicAuth("Basic !!!", "ops:secret")).toBe(false);
  });
});

describe("summarizeCosts", () => {
  it("totals by provider and per source minute", () => {
    const s = summarizeCosts(
      [
        { step: "transcribe", provider: "assemblyai", item: "t", quantity: 1, unit: "hour", usd: "0.035" },
        { step: "detect", provider: "anthropic", item: "c", quantity: 1, unit: "token", usd: 0.03 },
        { step: "render", provider: "modal", item: "r", quantity: 1, unit: "core_second", usd: 0.015 },
      ],
      600,
    );
    expect(s.total_usd).toBeCloseTo(0.08);
    expect(s.per_source_minute_usd).toBeCloseTo(0.008);
    expect(s.by_provider.assemblyai).toBeCloseTo(0.035);
  });
});

describe("overallProgress", () => {
  it("maps step ratios into global ranges", () => {
    expect(overallProgress("fetch", 0)).toBe(0);
    expect(overallProgress("prepare", 0)).toBe(6);
    expect(overallProgress("render", 0.5)).toBe(77.5);
    expect(overallProgress("render", 2)).toBe(100);
  });
});

describe("i18n catalogs", () => {
  it("has the same keys and placeholders in French and English", () => {
    const fr = messages.fr as Record<string, string>;
    const en = messages.en as Record<string, string>;
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(fr)) expect(vars(en[key]), key).toEqual(vars(fr[key]));
  });

  it("uses no em dashes in copy", () => {
    for (const text of [...Object.values(messages.fr), ...Object.values(messages.en)]) {
      expect(text).not.toContain("—");
    }
  });
});
