export type Shop = 'body' | 'paint' | 'final';

export type ObservabilityTier = 'sensored' | 'partial' | 'blind';

export interface StationSpec {
  id: string;
  shop: Shop;
  /** 1-based position within the shop, e.g. B4 has indexInShop 4. */
  indexInShop: number;
  name: string;
  tier: ObservabilityTier;
  nominalCycleSeconds: number;
  /** Named process values this station is known to produce; empty until sourced. */
  processValues: string[];
}
