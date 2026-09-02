/**
 * The shared surface/card system: every panel renders through this instead
 * of an ad hoc `border border-line bg-panel`, so elevation and radius stay
 * consistent everywhere they're used. 10px radius, layered elevation shadow.
 */
interface Props {
  children: React.ReactNode;
  /** 'resting' for ordinary panels; 'raised' for the one or two a reader's
   *  eye should land on first (a hero stat, the calibration chart). */
  elevation?: 'resting' | 'raised';
  className?: string;
}

export function Panel({ children, elevation = 'resting', className = '' }: Props) {
  return (
    <div
      className={`rounded border border-line bg-panel ${elevation === 'raised' ? 'shadow-raised' : 'shadow-panel'} ${className}`}
    >
      {children}
    </div>
  );
}
