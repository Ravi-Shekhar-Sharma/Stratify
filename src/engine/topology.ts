import { STATIONS } from './stations';

/**
 * A named, load-bearing buffer with real capacity, modelled as a continuous
 * vehicle-equivalent accumulator (not a discrete integer queue) because its
 * nominal fill is itself fractional in docs/assumptions.md (2.5 units on the
 * trim-to-chassis buffer). Everywhere else on the line, inter-station WIP is
 * "0 to 1 unit... coupled conveyor" — treated as tightly coupled with no
 * meaningful storage, so it isn't modelled as a separate buffer at all; see
 * the segment design note in simulation.ts.
 */
export interface NamedBuffer {
  id: string;
  /** Station id immediately upstream of this buffer. */
  upstreamOf: string;
  /** Station id immediately downstream of this buffer. */
  downstreamOf: string;
  nominalFill: number;
  capacity: number;
}

/** Painted Body Store, between P8 (paint) and S1 (final assembly). */
export const PAINTED_BODY_STORE: NamedBuffer = {
  id: 'painted-body-store',
  upstreamOf: 'S1',
  downstreamOf: 'P8',
  nominalFill: 180,
  capacity: 400,
};

/**
 * Trim-to-chassis decoupling buffer, between S8 and S9. Load-bearing: its
 * 2.5-unit nominal fill is what produces the 7-minute lead time in the demo
 * incident (docs/assumptions.md, "Derivation of the 7 minute lead time").
 */
export const TRIM_CHASSIS_BUFFER: NamedBuffer = {
  id: 'trim-chassis-buffer',
  upstreamOf: 'S9',
  downstreamOf: 'S8',
  nominalFill: 2.5,
  capacity: 15,
};

export const NAMED_BUFFERS: NamedBuffer[] = [PAINTED_BODY_STORE, TRIM_CHASSIS_BUFFER];

/**
 * The line as three segments, tightly coupled internally (near-zero WIP —
 * see simulation.ts), separated by the two named buffers above.
 */
export type SegmentId = 'bodyPaint' | 'trim' | 'chassisFinal';

export const SEGMENT_STATION_IDS: Record<SegmentId, string[]> = {
  bodyPaint: STATIONS.filter((s) => s.shop === 'body' || s.shop === 'paint').map((s) => s.id),
  trim: STATIONS.filter((s) => s.shop === 'final' && s.indexInShop <= 8).map((s) => s.id),
  chassisFinal: STATIONS.filter((s) => s.shop === 'final' && s.indexInShop >= 9).map((s) => s.id),
};

export const SEGMENT_ORDER: SegmentId[] = ['bodyPaint', 'trim', 'chassisFinal'];
