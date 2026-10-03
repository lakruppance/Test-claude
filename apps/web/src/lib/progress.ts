// Overall job progress (0-100) from the current step and its own completion ratio.
export const STEP_RANGES = {
  prepare: [0, 10],
  transcribe: [10, 40],
  detect: [40, 55],
  render: [55, 100],
} as const;

export type ProgressStep = keyof typeof STEP_RANGES;

export function overallProgress(step: ProgressStep, ratio = 0): number {
  const [from, to] = STEP_RANGES[step];
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return Math.round((from + (to - from) * clamped) * 100) / 100;
}
