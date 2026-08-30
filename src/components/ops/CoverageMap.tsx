import { PanelTitle } from '../PanelTitle';
import { SHOP_LABEL } from '@/twinTypes';
import type { ShopCoverage } from '@/opsMetrics';
import type { ObservabilityTier } from '@/engine/types';

interface Props {
  shops: ShopCoverage[];
}

const TIER_CLASS: Record<ObservabilityTier, string> = {
  sensored: 'bg-measured',
  partial: 'bg-slowing',
  blind: 'bg-starved',
};

const TIER_LABEL: Record<ObservabilityTier, string> = {
  sensored: 'Sensored',
  partial: 'Partial',
  blind: 'Blind',
};

/**
 * Every station in the line, grouped by shop, coloured by observability
 * tier — topology, not a measurement, so it never changes at runtime and
 * carries no confidence value of its own. Static reporting only: no click,
 * hover state, or filter control.
 */
export function CoverageMap({ shops }: Props) {
  const total = shops.reduce((s, sh) => s + sh.stations.length, 0);
  const blind = shops.reduce((s, sh) => s + sh.stations.filter((st) => st.tier === 'blind').length, 0);
  const partial = shops.reduce((s, sh) => s + sh.stations.filter((st) => st.tier === 'partial').length, 0);

  return (
    <div className="flex h-full flex-col">
      <PanelTitle
        title="Coverage Map"
        subtitle={`${blind} blind · ${partial} partial · ${total - blind - partial} sensored of ${total}`}
      />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {shops.map((shop) => (
          <div key={shop.shop}>
            <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-secondary">
              {SHOP_LABEL[shop.shop]}
            </div>
            <div className="flex flex-wrap gap-1">
              {shop.stations.map((station) => (
                <div
                  key={station.id}
                  title={`${station.id} · ${station.name} · ${TIER_LABEL[station.tier]}`}
                  className="flex h-9 w-11 flex-col items-center justify-center border border-line bg-panel-raised"
                  style={{ borderRadius: 0 }}
                >
                  <span className={`h-1.5 w-1.5 ${TIER_CLASS[station.tier]}`} />
                  <span className="mt-1 font-mono text-[8.5px] font-semibold text-ink-primary">{station.id}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 border-t border-line-soft px-4 py-2 text-[9px] uppercase tracking-[0.1em] text-ink-muted">
        <Legend swatch="bg-measured" label="Sensored" />
        <Legend swatch="bg-slowing" label="Partial" />
        <Legend swatch="bg-starved" label="Blind" />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 ${swatch}`} />
      {label}
    </span>
  );
}
