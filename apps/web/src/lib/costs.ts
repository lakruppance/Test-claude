export type CostEvent = {
  step: string;
  provider: string;
  item: string;
  quantity: number | string;
  unit: string;
  usd: number | string;
  meta?: Record<string, unknown>;
};

export type CostSummary = {
  total_usd: number;
  per_source_minute_usd: number | null;
  by_provider: Record<string, number>;
  by_step: Record<string, number>;
  events: CostEvent[];
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function summarizeCosts(events: CostEvent[], sourceSeconds: number): CostSummary {
  const by_provider: Record<string, number> = {};
  const by_step: Record<string, number> = {};
  let total = 0;
  for (const e of events) {
    const usd = Number(e.usd);
    total += usd;
    by_provider[e.provider] = round((by_provider[e.provider] ?? 0) + usd);
    by_step[e.step] = round((by_step[e.step] ?? 0) + usd);
  }
  return {
    total_usd: round(total),
    per_source_minute_usd: sourceSeconds > 0 ? round(total / (sourceSeconds / 60)) : null,
    by_provider,
    by_step,
    events,
  };
}
