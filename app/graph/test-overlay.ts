import type { DiagramEntityTestRecord } from "../lib/diagram-data";

export type CoverageBucket = "high" | "medium" | "low" | "none";

export function coverageBucket(
  coveragePct: number | null | undefined,
): CoverageBucket {
  if (coveragePct == null) return "none";
  if (coveragePct >= 80) return "high";
  if (coveragePct >= 50) return "medium";
  if (coveragePct >= 1) return "low";
  return "none";
}

export function coverageAlpha(coveragePct: number | null | undefined): number {
  if (coveragePct == null) return 0;
  const bucket = coverageBucket(coveragePct);
  if (bucket === "none") return 0;
  return 0.12;
}

export function safeCoverage(
  value: DiagramEntityTestRecord["coveragePct"] | unknown,
): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}
