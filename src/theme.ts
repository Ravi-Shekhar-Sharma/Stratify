/**
 * Hex literals mirroring tailwind.config.js's `colors` block, for the one
 * place Tailwind utility classes can't reach: SVG presentation attributes
 * that take a literal paint value (`stop-color`, `stroke` on a computed/
 * animated element, gradient stops). Keep these two files in sync by hand —
 * there is no build-time bridge between them.
 */
export const COLOR = {
  measured: '#34D399',
  inferred: '#22D3EE',
  cyan: '#22D3EE',
  slowing: '#FBBF24',
  starved: '#FB7185',
  inkPrimary: '#F3F4F6',
  inkSecondary: '#9CA3AF',
  inkMuted: '#6B7280',
  inkFaint: '#4B5563',
  line: '#2A2F34',
  lineSoft: '#1F2327',
  lineStrong: '#3A4046',
  panel: '#15181B',
  panelRaised: '#1C2024',
  bgDeep: '#0A0C0D',
} as const;
