/**
 * Plant-manager weekly-horizon view: derived readers over STATIONS (the
 * engine's static topology) and METRICS.stationShiftOperations (the real,
 * ground-truth per-station-per-shift aggregation computed by
 * ml/validate.py — see compute_station_shift_operations). Nothing here
 * simulates or infers anything new; it only reshapes numbers the engine and
 * the ML pipeline already produced.
 */
import { STATIONS } from './engine/stations';
import type { Shop, ObservabilityTier } from './engine/types';
import { METRICS, type StationShiftOperation } from './trustMetrics';

export interface CoverageStation {
  id: string;
  name: string;
  tier: ObservabilityTier;
}

export interface ShopCoverage {
  shop: Shop;
  stations: CoverageStation[];
}

const SHOP_ORDER: Shop[] = ['body', 'paint', 'final'];

/** Every station in the line, grouped by shop, in line order — straight
 *  from src/engine/stations.ts. This is the "which stations are blind"
 *  coverage map; no metrics.json involved, since tier is topology, not a
 *  measured or inferred quantity. */
export function coverageByShop(): ShopCoverage[] {
  return SHOP_ORDER.map((shop) => ({
    shop,
    stations: STATIONS.filter((s) => s.shop === shop)
      .sort((a, b) => a.indexInShop - b.indexInShop)
      .map((s) => ({ id: s.id, name: s.name, tier: s.tier })),
  }));
}

export interface BottleneckHeatmap {
  stationIds: string[];
  shiftSeeds: number[];
  /** null when this (station, shift) pair has no row — never 0, since 0 is
   *  a real, meaningful rate and must stay distinguishable from "no data". */
  rate(stationId: string, shiftSeed: number): number | null;
}

/** Recurring-bottleneck rate by station and shift, straight from
 *  METRICS.stationShiftOperations — the fraction of a station's visits in
 *  a given (real, simulated) shift whose true cycle time crossed the same
 *  ALERT_MULTIPLIER threshold used everywhere else in this codebase. Only
 *  covers the 10 blind/partial stations the soft-sensor pipeline already
 *  processes per shift (see the scope decision recorded 2026-08-30: the
 *  other 32 sensored stations would need a new aggregation pass this
 *  engine doesn't run today). */
export function bottleneckHeatmap(m = METRICS): BottleneckHeatmap {
  const stationIds = [...new Set(m.stationShiftOperations.map((r) => r.stationId))].sort();
  const shiftSeeds = [...new Set(m.stationShiftOperations.map((r) => r.shiftSeed))].sort((a, b) => a - b);
  const byKey = new Map<string, number>(
    m.stationShiftOperations.map((r) => [`${r.stationId} ${r.shiftSeed}`, r.bottleneckRate]),
  );
  return {
    stationIds,
    shiftSeeds,
    rate: (stationId, shiftSeed) => byKey.get(`${stationId} ${shiftSeed}`) ?? null,
  };
}

export interface ShiftVariation {
  stationId: string;
  tier: ObservabilityTier;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  n: number;
}

function groupByStation(rows: StationShiftOperation[]): Map<string, StationShiftOperation[]> {
  const grouped = new Map<string, StationShiftOperation[]>();
  for (const r of rows) {
    const list = grouped.get(r.stationId) ?? [];
    list.push(r);
    grouped.set(r.stationId, list);
  }
  return grouped;
}

/** How much a station's recurring-bottleneck rate varies from one
 *  simulated shift to the next. "Shift" here means one full simulated
 *  ~7.5h run (a distinct shiftSeed) — this engine does not model separate
 *  day/night crews or schedules, so this is shift-run-to-shift-run
 *  variation, not a calendar day/night comparison, and the view must say
 *  so rather than imply otherwise. */
export function shiftVariationByStation(m = METRICS): ShiftVariation[] {
  const grouped = groupByStation(m.stationShiftOperations);
  const result: ShiftVariation[] = [];
  for (const [stationId, rows] of grouped) {
    const rates = rows.map((r) => r.bottleneckRate);
    const mean = rates.reduce((s, v) => s + v, 0) / rates.length;
    const variance = rates.reduce((s, v) => s + (v - mean) ** 2, 0) / rates.length;
    result.push({
      stationId,
      tier: rows[0].tier,
      mean,
      min: Math.min(...rates),
      max: Math.max(...rates),
      stdDev: Math.sqrt(variance),
      n: rows.length,
    });
  }
  return result.sort((a, b) => a.stationId.localeCompare(b.stationId));
}

export interface StationAvailabilityOee {
  stationId: string;
  tier: ObservabilityTier;
  meanAvailability: number;
  meanPerformance: number;
  /** Availability x Performance only. ISO 22400-2's third factor, Quality,
   *  is not included — this engine has no defect/scrap signal anywhere
   *  (defect correlation was never implemented). Never call this plain
   *  "OEE" in the UI without that caveat travelling with it. */
  meanOee: number;
  n: number;
}

/** Per-station Availability and Performance (ISO 22400-2), averaged across
 *  the real simulated shifts in METRICS.stationShiftOperations. */
export function stationAvailabilityOee(m = METRICS): StationAvailabilityOee[] {
  const grouped = groupByStation(m.stationShiftOperations);
  const result: StationAvailabilityOee[] = [];
  for (const [stationId, rows] of grouped) {
    const meanAvailability = rows.reduce((s, r) => s + r.availability, 0) / rows.length;
    const meanPerformance = rows.reduce((s, r) => s + r.performance, 0) / rows.length;
    const meanOee = rows.reduce((s, r) => s + r.oeeAvailabilityTimesPerformance, 0) / rows.length;
    result.push({ stationId, tier: rows[0].tier, meanAvailability, meanPerformance, meanOee, n: rows.length });
  }
  return result.sort((a, b) => a.stationId.localeCompare(b.stationId));
}
