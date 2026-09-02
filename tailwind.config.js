/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — depth by stepped lightness, never pure black. Each
        // step ~4% lighter than its parent (base -> surface -> elevated ->
        // overlay). Old alias names (bg/panel/panel.raised/panel.inset) are
        // kept so every existing view inherits the new palette without a
        // rename; "inset" now means the highest elevation (tooltips,
        // dropdowns, popovers), not a sunken well — the old model had no
        // equivalent of "float above everything," and this system needs one.
        bg: { DEFAULT: '#0E1012', deep: '#0A0C0D' },
        panel: { DEFAULT: '#15181B', raised: '#1C2024', inset: '#242A2F' },
        // Hairline borders approximate white-on-surface at low alpha
        // (rgba(255,255,255,.05-.14)), as solid hex so opacity modifiers
        // (border-line/50 etc.) stay predictable across the codebase.
        line: { DEFAULT: '#2A2F34', soft: '#1F2327', strong: '#3A4046' },
        // text
        ink: {
          primary: '#F3F4F6',
          secondary: '#9CA3AF',
          muted: '#6B7280',
          faint: '#4B5563',
        },
        // Functional state colors — the one thing carried over unchanged in
        // meaning, richer in value. Used only to signal state, never as
        // decoration.
        measured: '#34D399',
        inferred: '#22D3EE',
        slowing: '#FBBF24',
        starved: '#FB7185',
        cyan: '#22D3EE',
      },
      fontFamily: {
        // Space Grotesk is body/descriptive-copy only (house style,
        // 2026-08-31) — every display headline, numeric, station label,
        // timestamp, and mono readout stays on font-mono, untouched.
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'],
      },
      // Real hierarchy: big jumps between levels, never a soup of near-same
      // 10-13px labels. Data still renders in font-mono + tabular-nums on
      // top of these sizes, set per-element, not baked into the scale.
      fontSize: {
        display: ['56px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        h1: ['36px', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        h2: ['24px', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        h3: ['19px', { lineHeight: '1.3' }],
        body: ['17px', { lineHeight: '1.6' }],
        caption: ['13px', { lineHeight: '1.4', letterSpacing: '0.08em' }],
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        // Layered elevation — never a single flat drop shadow. Each step
        // stacks a tight contact shadow with a soft, wide ambient one.
        panel: '0 1px 2px rgba(0,0,0,0.35), 0 8px 24px -8px rgba(0,0,0,0.5)',
        raised: '0 2px 4px rgba(0,0,0,0.4), 0 16px 40px -12px rgba(0,0,0,0.55)',
        overlay: '0 4px 8px rgba(0,0,0,0.45), 0 24px 56px -16px rgba(0,0,0,0.6)',
        glowmeasured: '0 0 0 4px rgba(52,211,153,0.14)',
        glowslowing: '0 0 0 4px rgba(251,191,36,0.16)',
        glowstarved: '0 0 0 4px rgba(251,113,133,0.18)',
        glowcyan: '0 0 0 3px rgba(34,211,238,0.2)',
        glowinferredsm: '0 0 5px rgba(34,211,238,0.55)',
      },
      backgroundImage: {
        // The one very soft radial glow permitted behind a primary focal
        // element (~4% opacity) and an ultra-faint technical grid (~2%),
        // per the design direction — never stacked on more than one hero.
        'glow-cyan': 'radial-gradient(60% 50% at 50% 0%, rgba(34,211,238,0.05), transparent 70%)',
        'grid-technical':
          'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '32px 32px',
      },
      keyframes: {
        pulseDot: {
          '0%,100%': { opacity: '1', boxShadow: '0 0 6px rgba(52,211,153,0.6)' },
          '50%': { opacity: '0.4', boxShadow: '0 0 2px rgba(52,211,153,0.2)' },
        },
        pulseDotCrit: {
          '0%,100%': { opacity: '1', boxShadow: '0 0 6px rgba(251,113,133,0.6)' },
          '50%': { opacity: '0.4', boxShadow: '0 0 2px rgba(251,113,133,0.2)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flowDash: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.8s ease-in-out infinite',
        pulseDotCrit: 'pulseDotCrit 1.2s ease-in-out infinite',
        sweep: 'sweep 1.1s linear infinite',
        riseIn: 'riseIn 0.35s ease-out both',
        flowDash: 'flowDash 1s linear infinite',
      },
    },
  },
  plugins: [],
};
