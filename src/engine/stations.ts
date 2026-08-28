import type { ObservabilityTier, Shop, StationSpec } from './types';

/**
 * Takt time in seconds. Derived in docs/assumptions.md: 2 shifts x 7.5
 * effective hours = 54,000 s/day at 1,000 vehicles/day => 54 s/vehicle.
 */
export const TAKT_SECONDS = 54;

/**
 * NAMES ARE AN ENGINEERING DEFAULT, NOT CONFIRMED WITH THE TEAM.
 *
 * docs/assumptions.md names only four of the 42 stations: S2 Cockpit,
 * S6 Seats, S9 Fluids, P3 Basecoat (all four are preserved exactly below).
 * The other 38 names are plausible standard automotive final-assembly/
 * paint/body-shop station names, assigned by Claude Code on 2026-08-28 so
 * the engine has a station table to build against. Swap any of them freely —
 * stations are data, not code, so this is a one-line edit per station, not a
 * refactor.
 */

/**
 * S6's steady-state simulated cycle time is TAKT_SECONDS (54s), not the
 * "Nominal cycle: 55 s" figure in docs/assumptions.md. Reason: the demo
 * incident's own 7-minute derivation uses 54s (takt) as the baseline
 * throughout — both for "downstream consumes one every 54 s at takt" and
 * implicitly for S6 pre-incident — and never uses 55s in any calculation.
 * Reading 55s as S6's descriptive/unconstrained cycle (why it's a
 * manual, borderline station) rather than its paced production rate keeps
 * the undisturbed line at ~1,000/day and matches the file's own math. Only
 * the injected incident (80s) is a real deviation from takt. If this
 * reading is wrong, the fix is a one-line change to S6's row below plus
 * updating the incident-test tolerance in simulation.test.ts — not a
 * rewrite.
 */

function station(
  id: string,
  shop: Shop,
  indexInShop: number,
  name: string,
  tier: ObservabilityTier,
  processValues: string[] = [],
): StationSpec {
  return { id, shop, indexInShop, name, tier, nominalCycleSeconds: TAKT_SECONDS, processValues };
}

const BODY: StationSpec[] = [
  station('B1', 'body', 1, 'Underbody Framing', 'sensored'),
  station('B2', 'body', 2, 'Side Frame Marriage', 'sensored'),
  station('B3', 'body', 3, 'Body Respot (Weld)', 'sensored', ['weld_count']),
  station('B4', 'body', 4, 'Roof Fitting', 'sensored'),
  station('B5', 'body', 5, 'Door Hang', 'sensored'),
  station('B6', 'body', 6, 'Hood & Deck Lid Fitting', 'sensored'),
  station('B7', 'body', 7, 'Metal Finish', 'sensored'),
  station('B8', 'body', 8, 'Sealing', 'sensored'),
  station('B9', 'body', 9, 'Squareness Check', 'sensored', ['squareness_deviation_mm']),
  station('B10', 'body', 10, 'Weld Quality Scan', 'sensored', ['weld_quality_score']),
  station('B11', 'body', 11, 'Dimensional Inspection', 'sensored', ['dimensional_deviation_mm']),
  station('B12', 'body', 12, 'Body Shop EOL', 'sensored'),
];

const PAINT: StationSpec[] = [
  station('P1', 'paint', 1, 'Pretreatment / Phosphate', 'sensored', ['bath_conductivity']),
  station('P2', 'paint', 2, 'E-Coat', 'sensored', ['coating_thickness_um']),
  station('P3', 'paint', 3, 'Basecoat', 'sensored', ['booth_humidity_pct']),
  station('P4', 'paint', 4, 'Sealer Application', 'sensored'),
  station('P5', 'paint', 5, 'Primer / Surfacer', 'sensored'),
  station('P6', 'paint', 6, 'Clearcoat', 'sensored', ['film_thickness_um']),
  station('P7', 'paint', 7, 'Paint Oven / Bake', 'partial', ['oven_temperature_c']),
  station('P8', 'paint', 8, 'Paint Inspection & Buff', 'partial', ['defect_count']),
];

const FINAL: StationSpec[] = [
  station('S1', 'final', 1, 'Wiring Harness', 'sensored'),
  station('S2', 'final', 2, 'Cockpit', 'sensored', ['fastener_torque_nm']),
  station('S3', 'final', 3, 'Glazing', 'blind'),
  station('S4', 'final', 4, 'Headliner', 'sensored'),
  station('S5', 'final', 5, 'Door Trim', 'sensored'),
  station('S6', 'final', 6, 'Seats', 'blind'),
  station('S7', 'final', 7, 'Carpet & Insulation', 'sensored'),
  station('S8', 'final', 8, 'Interior Trim Finish', 'partial', ['fastener_torque_spotcheck_nm']),
  station('S9', 'final', 9, 'Fluids', 'sensored', ['fill_volume_l']),
  station('S10', 'final', 10, 'Engine Mount', 'sensored'),
  station('S11', 'final', 11, 'Subframe Marriage', 'blind'),
  station('S12', 'final', 12, 'Suspension', 'sensored'),
  station('S13', 'final', 13, 'Exhaust System', 'sensored'),
  station('S14', 'final', 14, 'Brake Lines', 'blind'),
  station('S15', 'final', 15, 'Fuel Tank', 'sensored'),
  station('S16', 'final', 16, 'Wheels & Tires', 'sensored', ['wheel_torque_nm']),
  station('S17', 'final', 17, 'Battery Install', 'blind'),
  station('S18', 'final', 18, 'Bumpers', 'sensored'),
  station('S19', 'final', 19, 'Underbody Fasteners', 'blind'),
  station('S20', 'final', 20, 'Wheel Alignment', 'sensored', ['alignment_deviation']),
  station('S21', 'final', 21, 'Torque Audit', 'partial', ['torque_spotcheck_nm']),
  station('S22', 'final', 22, 'EOL Test', 'sensored', ['functional_test_pass']),
];

/** Full 42-station table, in line order: body -> paint -> final. */
export const STATIONS: StationSpec[] = [...BODY, ...PAINT, ...FINAL];

export const STATIONS_BY_ID: Record<string, StationSpec> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
);

export function stationsInShop(shop: Shop): StationSpec[] {
  return STATIONS.filter((s) => s.shop === shop);
}
