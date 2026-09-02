import { CalibrationChart } from './CalibrationChart';
import { AlertPerformancePanel } from './AlertPerformancePanel';
import { FalseAlarmCallout } from './FalseAlarmCallout';
import { TierErrorPanel } from './TierErrorPanel';
import { SensorLiftCallout } from './SensorLiftCallout';
import { TrustLedger } from './TrustLedger';
import { ModelSkillPanel } from './ModelSkillPanel';
import { AbstentionFloorPanel } from './AbstentionFloorPanel';
import { Panel } from '../Panel';
import { Reveal } from '../Reveal';
import { ViewHero } from '../ViewHero';
import { ChapterNav } from '../ChapterNav';
import { METRICS, sensorLift, buildLedgerRows, meanCalibrationErrorPts } from '@/trustMetrics';
import { CONFIDENCE_FLOOR } from '@/engine/inference/softSensor';
import type { View } from '../TopNav';

interface Props {
  onNavigate: (view: View) => void;
}

/**
 * A section chapter heading, not a small caption label — this page reads
 * as an argument now (calibration -> alerting -> error by tier ->
 * instrumentation -> ledger), so each step gets real weight: an ordinal,
 * an H2-scale title, and a one-line statement of what the section
 * proves, with generous top padding (pt-16/pt-20, Floor's own macro-
 * whitespace scale) so a reader's eye actually rests between ideas
 * instead of scanning one continuous wall of panels.
 */
function SectionHeading({ ordinal, title, children }: { ordinal: string; title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 pb-6 pt-16 sm:px-8 sm:pt-24">
      <span className="font-mono text-caption font-bold uppercase tracking-[0.18em] text-cyan">{ordinal}</span>
      <h2 className="mt-2 font-mono text-h2 font-bold tracking-[-0.01em] text-ink-primary">{title}</h2>
      <p className="mt-2 max-w-[68ch] text-[16px] leading-[1.6] text-white/72">{children}</p>
    </div>
  );
}

/**
 * The model trust view: every number on this page is read from
 * ml/artifacts/metrics.json (src/trustMetrics.ts) — the committed,
 * reproducible output of `python ml/validate.py`. Nothing here is
 * recomputed, guessed, or copied from a deck. Round 2: the calibration
 * curve is promoted to the actual hero of the page (it was a small chart
 * in a narrow column before), the page is broken into five sections that
 * read as an argument rather than a wall of panels, and two credibility
 * numbers that already existed in metrics.json but were never shown
 * (skill vs. a naive baseline, train vs. held-out error) now have a home.
 */
export function TrustView({ onNavigate }: Props) {
  const s6Lift = sensorLift('S6');
  const ledgerRows = buildLedgerRows();
  const far = METRICS.alertMetricsByBand.easy.falseAlarmRate;
  const calErr = meanCalibrationErrorPts(METRICS.calibration);
  const totalIncidentRuns =
    METRICS.s6S9LeadTime.deliverable.byBand.easy.totalIncidentRuns +
    METRICS.s6S9LeadTime.deliverable.byBand.marginal.totalIncidentRuns;

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <div className="relative z-10">
        <ViewHero
          eyebrow="Model Trust"
          headline="A prediction nobody scores is a guess."
          subtitle="Every estimate on this page is checked against real outcomes it never saw during training, scored honestly - wins and misses both, never buried in a table."
          proofs={[
            { value: far * 100, decimals: 2, suffix: '%', label: 'False alarm rate, held-out', tone: 'text-measured' },
            { value: calErr, decimals: 1, suffix: ' pts', label: 'Mean calibration error', tone: 'text-cyan' },
            { value: METRICS.validationRows, suffix: 'rows', label: 'Held-out evidence set', tone: 'text-inferred' },
          ]}
        />

        <SectionHeading ordinal="01 - Calibration" title="How well calibrated are we?">
          When Stratify states a confidence, this is the direct evidence it is right that often - the single most
          important object on this page.
        </SectionHeading>
        <Reveal className="px-6 sm:px-8">
          <Panel elevation="raised" className="overflow-hidden">
            <CalibrationChart
              points={METRICS.calibration}
              toleranceSeconds={METRICS.calibrationToleranceSeconds}
              toleranceDerivation={METRICS.calibrationToleranceDerivation}
            />
          </Panel>
        </Reveal>
        <Reveal className="px-6 pt-6 sm:px-8" index={0}>
          <Panel>
            <ModelSkillPanel baselines={METRICS.baselines} regime={METRICS.regimeDecomposition} />
          </Panel>
        </Reveal>
        <Reveal className="px-6 pt-6 sm:px-8" index={1}>
          <Panel>
            <AbstentionFloorPanel points={METRICS.calibration} confidenceFloor={CONFIDENCE_FLOOR} />
          </Panel>
        </Reveal>

        <SectionHeading ordinal="02 - Alerting" title="How well do we alert?">
          A low false-alarm rate is only half the honesty this product sells - the other half is where the alert
          genuinely cannot keep up, stated plainly rather than buried.
        </SectionHeading>
        <Reveal className="px-6 sm:px-8">
          <Panel elevation="raised">
            <FalseAlarmCallout alertBands={METRICS.alertMetricsByBand} deliverable={METRICS.s6S9LeadTime.deliverable} />
          </Panel>
        </Reveal>
        <Reveal className="px-6 pt-6 sm:px-8">
          <Panel>
            <AlertPerformancePanel alertBands={METRICS.alertMetricsByBand} leadTime={METRICS.s6S9LeadTime} />
          </Panel>
        </Reveal>

        <SectionHeading ordinal="03 - Error by tier" title="How does error vary with signal exposed?">
          Sensored reports ground truth directly. Blind and partial infer it - this is what that costs in real
          error, station by station.
        </SectionHeading>
        <Reveal className="px-6 sm:px-8">
          <Panel>
            <TierErrorPanel
              perTier={METRICS.perTier}
              confidenceCeilings={METRICS.confidenceCeilings}
              naiveBaselineMaeSeconds={METRICS.baselines.nominalCycleBaseline.maeSeconds.overallSeconds}
            />
          </Panel>
        </Reveal>

        <SectionHeading ordinal="04 - Instrumentation" title="What would instrumenting a station buy?">
          The real confidence lift from moving one station from inferred to sensored - an empirical average, not a
          matched before/after pair.
        </SectionHeading>
        <Reveal className="px-6 sm:px-8">
          <Panel>
            {s6Lift ? (
              <SensorLiftCallout lift={s6Lift} />
            ) : (
              <span className="p-6 text-[15px] text-white/72">S6 not present in this run's per-station data.</span>
            )}
          </Panel>
        </Reveal>

        <SectionHeading ordinal="05 - Ledger" title="The scored record">
          Every prediction on this page is append-only and scored against what actually happened - a flight
          recorder, not a curated highlight reel.
        </SectionHeading>
        <Reveal className="px-6 pb-16 sm:px-8">
          <Panel className="h-[460px]">
            <TrustLedger rows={ledgerRows} totalIncidentRuns={totalIncidentRuns} />
          </Panel>
        </Reveal>

        <ChapterNav targetView="ops" targetLabel="Plant" description="the pattern over time" onNavigate={onNavigate} />
      </div>
    </div>
  );
}
