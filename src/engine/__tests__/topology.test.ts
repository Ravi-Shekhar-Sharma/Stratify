import { describe, expect, it } from 'vitest';
import { PAINTED_BODY_STORE, SEGMENT_STATION_IDS, TRIM_CHASSIS_BUFFER } from '../topology';

describe('line topology', () => {
  it('Painted Body Store sits between P8 and S1 with the assumptions-file fill/capacity', () => {
    expect(PAINTED_BODY_STORE.downstreamOf).toBe('P8');
    expect(PAINTED_BODY_STORE.upstreamOf).toBe('S1');
    expect(PAINTED_BODY_STORE.nominalFill).toBe(180);
    expect(PAINTED_BODY_STORE.capacity).toBe(400);
  });

  it('the trim-to-chassis buffer sits between S8 and S9 with the load-bearing 2.5 nominal fill', () => {
    expect(TRIM_CHASSIS_BUFFER.downstreamOf).toBe('S8');
    expect(TRIM_CHASSIS_BUFFER.upstreamOf).toBe('S9');
    expect(TRIM_CHASSIS_BUFFER.nominalFill).toBe(2.5);
    expect(TRIM_CHASSIS_BUFFER.capacity).toBe(15);
  });

  it('segments partition all 42 stations with no overlap, trim ending at S8', () => {
    const all = [...SEGMENT_STATION_IDS.bodyPaint, ...SEGMENT_STATION_IDS.trim, ...SEGMENT_STATION_IDS.chassisFinal];
    expect(new Set(all).size).toBe(42);
    expect(all).toHaveLength(42);
    expect(SEGMENT_STATION_IDS.trim[SEGMENT_STATION_IDS.trim.length - 1]).toBe('S8');
    expect(SEGMENT_STATION_IDS.chassisFinal[0]).toBe('S9');
  });

  it('S6 is inside the trim segment, upstream of the load-bearing buffer', () => {
    expect(SEGMENT_STATION_IDS.trim).toContain('S6');
  });
});
