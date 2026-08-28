import { describe, expect, it } from 'vitest';
import { STATIONS, STATIONS_BY_ID, TAKT_SECONDS, stationsInShop } from '../stations';

describe('station table', () => {
  it('has exactly 42 stations', () => {
    expect(STATIONS).toHaveLength(42);
  });

  it('matches the shop counts in docs/assumptions.md (12 body, 8 paint, 22 final)', () => {
    expect(stationsInShop('body')).toHaveLength(12);
    expect(stationsInShop('paint')).toHaveLength(8);
    expect(stationsInShop('final')).toHaveLength(22);
  });

  it('has unique ids', () => {
    const ids = STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the observability tier counts in docs/assumptions.md (32 sensored, 4 partial, 6 blind)', () => {
    const byTier = (tier: string) => STATIONS.filter((s) => s.tier === tier).length;
    expect(byTier('sensored')).toBe(32);
    expect(byTier('partial')).toBe(4);
    expect(byTier('blind')).toBe(6);
  });

  it('body shop is fully sensored (12 of 12)', () => {
    expect(stationsInShop('body').every((s) => s.tier === 'sensored')).toBe(true);
  });

  it('paint shop has 6 sensored + 2 partial, 0 blind', () => {
    const paint = stationsInShop('paint');
    expect(paint.filter((s) => s.tier === 'sensored')).toHaveLength(6);
    expect(paint.filter((s) => s.tier === 'partial')).toHaveLength(2);
    expect(paint.filter((s) => s.tier === 'blind')).toHaveLength(0);
  });

  it('final assembly blind stations are exactly S3, S6, S11, S14, S17, S19 per docs/assumptions.md', () => {
    const blindIds = STATIONS.filter((s) => s.tier === 'blind').map((s) => s.id).sort();
    expect(blindIds).toEqual(['S11', 'S14', 'S17', 'S19', 'S3', 'S6'].sort());
  });

  it('final assembly partial stations are exactly S8 and S21, plus P7 and P8 in paint', () => {
    const partialIds = STATIONS.filter((s) => s.tier === 'partial').map((s) => s.id).sort();
    expect(partialIds).toEqual(['P7', 'P8', 'S21', 'S8'].sort());
  });

  it('preserves the four station names given explicitly in docs/assumptions.md', () => {
    expect(STATIONS_BY_ID['S2'].name).toBe('Cockpit');
    expect(STATIONS_BY_ID['S6'].name).toBe('Seats');
    expect(STATIONS_BY_ID['S9'].name).toBe('Fluids');
    expect(STATIONS_BY_ID['P3'].name).toBe('Basecoat');
  });

  it('every station defaults to takt as its steady-state cycle time', () => {
    expect(STATIONS.every((s) => s.nominalCycleSeconds === TAKT_SECONDS)).toBe(true);
  });

  it('takt is 54 seconds per docs/assumptions.md', () => {
    expect(TAKT_SECONDS).toBe(54);
  });
});
