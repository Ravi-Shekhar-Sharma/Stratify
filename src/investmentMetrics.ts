/**
 * Leadership investment-case view: ranks the 10 blind/partial stations by
 * confidence gained per dollar of instrumentation spend, at three fixed
 * budget levels, and lays out a rollout path gated by the real
 * maintenance-windows-per-year constraint. Every number traces to
 * ml/artifacts/metrics.json (via trustMetrics.ts) or
 * src/engine/assumptions.ts — nothing here is invented or entered live.
 */
import { METRICS, type Tier } from './trustMetrics';
import { PLANT_DEPLOYABLE_COST_USD_RANGE, MAINTENANCE_WINDOWS_PER_YEAR } from './engine/assumptions';

export interface SensorInvestment {
  stationId: string;
  tier: Tier;
  currentMeanConfidence: number;
  /** Sensored ceiling minus this station's real empirical mean confidence
   *  — the same quantity src/trustMetrics.ts's sensorLift computes for S6
   *  alone, generalised to every non-sensored station. */
  confidenceGain: number;
  costLowUsd: number;
  costHighUsd: number;
  costMidUsd: number;
  /** confidenceGain (as points, x1000) per $1000 of the plant-deployable
   *  cost midpoint. docs/assumptions.md gives one cost RANGE for
   *  instrumentation, not a per-station figure, so this range is identical
   *  for every station — ranking therefore reduces to ranking by
   *  confidenceGain alone. Stated honestly in the view rather than implying
   *  a cost difference that isn't in the source data. */
  gainPerThousandUsd: number;
  rank: number;
}

/** Every non-sensored station in perStation, ranked by confidence gained
 *  per dollar of instrumentation spend (highest first). Sensored stations
 *  are excluded — there is nothing to invest in, they already report
 *  ground truth. */
export function rankedSensorInvestments(m = METRICS): SensorInvestment[] {
  const [costLowUsd, costHighUsd] = PLANT_DEPLOYABLE_COST_USD_RANGE;
  const costMidUsd = (costLowUsd + costHighUsd) / 2;

  const unranked = Object.entries(m.perStation)
    .filter(([, s]) => s.tier !== 'sensored')
    .map(([stationId, s]) => {
      const confidenceGain = m.confidenceCeilings.sensored - s.meanConfidence;
      return {
        stationId,
        tier: s.tier,
        currentMeanConfidence: s.meanConfidence,
        confidenceGain,
        costLowUsd,
        costHighUsd,
        costMidUsd,
        gainPerThousandUsd: (confidenceGain * 1000) / costMidUsd,
      };
    })
    .sort((a, b) => b.gainPerThousandUsd - a.gainPerThousandUsd);

  return unranked.map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface BudgetTier {
  label: string;
  stationCount: number;
  stationIds: string[];
  totalCostLowUsd: number;
  totalCostHighUsd: number;
  totalConfidenceGain: number;
}

/** Three fixed levels — cover the single best station, the top 3, or all
 *  10 — with cost and aggregate confidence gain summed from the real
 *  ranked figures. Deliberately not three round dollar figures: those
 *  would be invented numbers with no source in docs/assumptions.md. */
export function budgetTiers(m = METRICS): BudgetTier[] {
  const ranked = rankedSensorInvestments(m);
  const counts = [1, 3, ranked.length].filter((n, i, arr) => arr.indexOf(n) === i && n <= ranked.length);

  return counts.map((n) => {
    const covered = ranked.slice(0, n);
    return {
      label: n === ranked.length ? `All ${n} stations` : `Top ${n} station${n > 1 ? 's' : ''}`,
      stationCount: n,
      stationIds: covered.map((c) => c.stationId),
      totalCostLowUsd: covered.reduce((s, c) => s + c.costLowUsd, 0),
      totalCostHighUsd: covered.reduce((s, c) => s + c.costHighUsd, 0),
      totalConfidenceGain: covered.reduce((s, c) => s + c.confidenceGain, 0),
    };
  });
}

export interface RolloutStep {
  stationId: string;
  rank: number;
  year: number;
  windowInYear: number;
}

/** Schedules the given stations into maintenance windows one per window,
 *  in rank order, filling every window of a year before advancing to the
 *  next year. MAINTENANCE_WINDOWS_PER_YEAR (4, quarterly) is the one real
 *  constraint from docs/assumptions.md; this function invents no capacity
 *  number beyond it — one station per window is the simplest schedule that
 *  respects "batch into windows" without assuming how many installs fit in
 *  a single window. */
export function rolloutPath(stationIds: string[], m = METRICS): RolloutStep[] {
  const ranked = rankedSensorInvestments(m);
  const rankById = new Map(ranked.map((r) => [r.stationId, r.rank]));
  const ordered = [...stationIds].sort((a, b) => rankById.get(a)! - rankById.get(b)!);

  return ordered.map((stationId, i) => ({
    stationId,
    rank: rankById.get(stationId)!,
    year: Math.floor(i / MAINTENANCE_WINDOWS_PER_YEAR) + 1,
    windowInYear: (i % MAINTENANCE_WINDOWS_PER_YEAR) + 1,
  }));
}

/** Payback is deliberately NOT computed. docs/assumptions.md's "Pending
 *  verification" section marks automotive unplanned-downtime cost and
 *  cost-of-poor-quality as unverified, owned by teammate 2 — either would
 *  be needed to convert a confidence-point gain into a dollar benefit to
 *  compare against instrumentation spend. Decision recorded 2026-08-30:
 *  ship the ranked table and rollout path without payback rather than
 *  invent a benefit figure. */
export const PAYBACK_STATUS = {
  available: false,
  reason:
    "docs/assumptions.md marks automotive unplanned-downtime cost and cost-of-poor-quality as unverified/pending (owned by teammate 2) - payback requires one of those to convert a confidence-point gain into a dollar benefit.",
} as const;
