import { motion } from 'motion/react';
import { PanelTitle } from '../PanelTitle';
import { ChartLegend, TIER_COLOR } from '../charts/chartKit';
import { DRAW_IN } from '@/motion';
import { SHOP_LABEL } from '@/twinTypes';
import type { ShopCoverage, CoverageStation } from '@/opsMetrics';
import type { ObservabilityTier } from '@/engine/types';

interface Props {
  shops: ShopCoverage[];
}

const TIER_LABEL: Record<ObservabilityTier, string> = {
  sensored: 'Sensored',
  partial: 'Partial',
  blind: 'Blind',
};

/** Sensored is always Measured (green) on Floor - ground truth, unchanged
 *  meaning. Partial and blind are both inferred tiers on Floor - neither
 *  is ever raw-measured, so both read as Inferred (cyan) here too, rather
 *  than reaching for Floor's Degrading (amber) or an unrelated red for
 *  "less coverage." Blind is distinguished from partial by weight (hollow
 *  ring vs solid fill), not a second colour Floor doesn't use for this. */
function TierDot({ tier, size = 6 }: { tier: ObservabilityTier; size?: number }) {
  const s = { width: size, height: size };
  if (tier === 'sensored') return <span className="shrink-0 rounded-full bg-measured" style={s} />;
  if (tier === 'partial') return <span className="shrink-0 rounded-full bg-inferred" style={s} />;
  return <span className="shrink-0 rounded-full border border-inferred bg-transparent" style={s} />;
}

/** Visual weight, not just colour, separates the tiers: sensored chips sit
 *  quiet and low-contrast (there are 32 of them and they carry no story),
 *  partial and blind chips are elevated with a tinted background and a
 *  full-opacity border so the 10 stations that actually need attention
 *  read as a distinct, brighter layer rather than being spread evenly
 *  among 42 identical pills. */
function StationChip({ station }: { station: CoverageStation }) {
  const quiet = station.tier === 'sensored';
  return (
    <div
      title={`${station.id} - ${station.name} - ${TIER_LABEL[station.tier]}`}
      className={`flex h-10 w-12 flex-col items-center justify-center gap-1 rounded border ${
        quiet
          ? 'border-line-soft bg-panel-inset/50 opacity-70'
          : 'border-inferred/50 bg-inferred/10 shadow-panel'
      }`}
    >
      <TierDot tier={station.tier} size={quiet ? 5 : 7} />
      <span className={`font-mono text-[10px] font-semibold ${quiet ? 'text-ink-secondary' : 'text-ink-primary'}`}>
        {station.id}
      </span>
    </div>
  );
}

/**
 * Every station in the line, grouped by shop, coloured by observability
 * tier — topology, not a measurement, so it never changes at runtime and
 * carries no confidence value of its own. Static reporting only: no click,
 * hover state, or filter control.
 *
 * Rebuilt (design round 3, item 4): a single proportional band showing the
 * 32/4/6 split as one glanceable object leads the panel, with a plain-
 * language sentence stating the same split in words right beside it. A
 * "Blind & partial" callout pulls the 10 stations that actually carry the
 * product's story out of the full 42-station grid so they don't hide among
 * the 32 sensored ones; the full per-shop grid stays underneath for
 * completeness, with sensored stations rendered deliberately quieter.
 */
export function CoverageMap({ shops }: Props) {
  const all = shops.flatMap((sh) => sh.stations);
  const total = all.length;
  const blindStations = all.filter((s) => s.tier === 'blind');
  const partialStations = all.filter((s) => s.tier === 'partial');
  const sensoredCount = total - blindStations.length - partialStations.length;

  const segments: { tier: ObservabilityTier; count: number }[] = [
    { tier: 'sensored', count: sensoredCount },
    { tier: 'partial', count: partialStations.length },
    { tier: 'blind', count: blindStations.length },
  ];

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Coverage Map" subtitle={`${total} stations, final assembly line`} />
      <div className="flex flex-col gap-5 p-4">
        <div className="flex flex-col gap-2.5">
          <p className="text-[15px] leading-[1.5] text-white/72">
            <span className="font-mono font-semibold text-measured">{sensoredCount} sensored</span>,{' '}
            <span className="font-mono font-semibold text-inferred">{partialStations.length} partial</span> and{' '}
            <span className="font-mono font-semibold text-inferred">{blindStations.length} blind</span> - out of{' '}
            {total} stations on the line.
          </p>
          <div className="flex h-8 w-full overflow-hidden rounded border border-line-soft">
            {segments.map((seg, i) =>
              seg.count === 0 ? null : (
                <motion.div
                  key={seg.tier}
                  className={`flex items-center justify-center overflow-hidden ${i > 0 ? 'border-l border-bg/40' : ''}`}
                  style={
                    // Partial and blind share a hue (both are inferred
                    // tiers, see TierDot's own reasoning), which made them
                    // render as one indistinguishable cyan block sitting
                    // next to each other in the band - a real bug, not
                    // just a subtlety. Blind gets a diagonal hatch instead
                    // of a flat fill (the same "less certain" grammar as
                    // Floor's own Abstained legend swatch), so the 4-vs-6
                    // split is legible as two distinct regions, not one.
                    seg.tier === 'blind'
                      ? {
                          backgroundImage: `repeating-linear-gradient(135deg, ${TIER_COLOR.blind} 0px, ${TIER_COLOR.blind} 3px, transparent 3px, transparent 7px)`,
                          backgroundColor: 'rgba(34,211,238,0.12)',
                        }
                      : { backgroundColor: TIER_COLOR[seg.tier], opacity: seg.tier === 'sensored' ? 0.55 : 0.85 }
                  }
                  initial={{ width: 0 }}
                  animate={{ width: `${(seg.count / total) * 100}%` }}
                  transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease }}
                >
                  <span className={`whitespace-nowrap font-mono text-[11px] font-bold ${seg.tier === 'blind' ? 'text-ink-primary' : 'text-bg'}`}>
                    {seg.count >= 3 ? seg.count : ''}
                  </span>
                </motion.div>
              ),
            )}
          </div>
          <ChartLegend
            items={[
              { swatch: <TierDot tier="sensored" />, label: `Sensored (${sensoredCount})` },
              { swatch: <TierDot tier="partial" />, label: `Partial (${partialStations.length})` },
              { swatch: <TierDot tier="blind" />, label: `Blind (${blindStations.length})` },
            ]}
          />
        </div>
      </div>

      <div className="thin-scroll flex-1 space-y-4 overflow-auto border-t border-line-soft p-4">
        {shops.map((shop) => (
          <div key={shop.shop}>
            <div className="mb-2 text-caption font-bold uppercase tracking-[0.14em] text-ink-secondary">
              {SHOP_LABEL[shop.shop]}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {shop.stations.map((station) => (
                <StationChip key={station.id} station={station} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
