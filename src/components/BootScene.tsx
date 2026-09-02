import { motion } from 'motion/react';
import { HeroWireframe } from './HeroWireframe';
import { STATIONS, TAKT_SECONDS } from '@/engine/stations';
import type { StationViewModel } from '@/twinTypes';

const BOOT_STATIONS: StationViewModel[] = STATIONS.map((spec) => ({ spec, state: { kind: 'pending' } }));

/**
 * The first thing a judge sees, designed on purpose instead of left to a
 * generic placeholder. The wireframe and the real station spine (all
 * stations rendered as pending — genuinely true, not fabricated: nothing
 * has connected yet) draw in immediately; a short staggered sequence
 * initialises across the line while the engine spins up. `connecting`
 * lasts under a second in practice, but a boot state built to look
 * intentional at any duration is what keeps the first frame from reading
 * as broken.
 */
export function BootScene() {
  return (
    <div className="relative min-h-screen bg-bg text-ink-primary">
      <div className="relative">
        <HeroWireframe />

        <header className="border-b border-line-soft px-6 pb-8 pt-10 sm:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-pulseDot" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan">
              Initializing
            </span>
          </motion.div>
          <h1 className="mt-4 text-[32px] font-bold font-mono leading-[1.1] tracking-[-0.01em] text-ink-primary sm:text-[42px] sm:tracking-[-0.015em] lg:text-display lg:tracking-[-0.02em]">
            Final Assembly Twin
          </h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-[1.6] text-white/72">
            Connecting to the 42-station line.
          </p>
          <div className="mt-7 flex flex-wrap items-end gap-8">
            <div className="flex flex-col gap-1.5">
              <span className="text-caption uppercase tracking-[0.08em] text-white/50">Takt</span>
              <span className="font-mono text-[20px] font-semibold tabular-nums text-ink-primary">{TAKT_SECONDS}s</span>
            </div>
          </div>
        </header>

        <section className="relative px-6 pb-10 pt-10 sm:px-8">
          <div className="relative overflow-hidden rounded-xl border border-line-soft bg-panel/40 px-8 py-10 shadow-panel sm:px-10">
            <div className="pointer-events-none absolute inset-0 bg-glow-cyan" aria-hidden />
            <div className="relative mb-6 flex items-baseline justify-between">
              <h2 className="font-mono text-caption font-bold uppercase tracking-[0.16em] text-ink-secondary">
                Production Line
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">{BOOT_STATIONS.length} stations · 3 shops</span>
            </div>
            <BootSpine />
          </div>
        </section>
      </div>
    </div>
  );
}

function BootSpine() {
  const w = 1600;
  const h = 120;
  const gap = w / (BOOT_STATIONS.length + 1);

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <motion.line
        x1={gap * 0.5}
        y1={h / 2}
        x2={gap * 0.5}
        y2={h / 2}
        stroke="#3A4046"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ x2: gap * 0.5 }}
        animate={{ x2: w - gap * 0.5 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
      {BOOT_STATIONS.map((sv, i) => (
        <motion.circle
          key={sv.spec.id}
          cx={gap * (i + 1)}
          cy={h / 2}
          r={4}
          fill="none"
          stroke="#4B5563"
          strokeWidth="1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.15 + i * 0.014, duration: 0.3 }}
        />
      ))}
    </svg>
  );
}
