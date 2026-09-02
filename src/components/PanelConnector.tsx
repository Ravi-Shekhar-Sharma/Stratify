interface Props {
  highlight?: boolean;
}

/**
 * The thin line that makes Inference Detail -> Buffer Risk -> Recommended
 * Action read as one causal story instead of three unrelated cards. No
 * arrowhead glyph — direction is already carried by reading order and the
 * "Cause -> Effect -> Action" label above; a shape here would just be an
 * icon by another name.
 */
export function PanelConnector({ highlight = false }: Props) {
  return (
    <div className="hidden items-center justify-center lg:flex" aria-hidden>
      <div className={`h-px w-full ${highlight ? 'bg-cyan/50' : 'bg-line-soft'} transition-colors duration-500`}>
        <div
          className={`h-px w-2/3 ${highlight ? 'bg-cyan' : 'bg-line-strong'} transition-all duration-500`}
          style={{ marginLeft: highlight ? '33%' : '0%' }}
        />
      </div>
    </div>
  );
}
