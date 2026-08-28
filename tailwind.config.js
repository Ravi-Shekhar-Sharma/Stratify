/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // surfaces
        bg: { DEFAULT: '#0A0D11', deep: '#080A0D' },
        panel: { DEFAULT: '#10151B', raised: '#141B23', inset: '#0C1116' },
        line: { DEFAULT: '#1E2730', soft: '#161D24', strong: '#283340' },
        // text
        ink: {
          primary: '#D4DBE3',
          secondary: '#8A96A5',
          muted: '#5C6773',
          faint: '#3D4651',
        },
        // functional state colors (used only to signal state)
        measured: '#3FB38B',
        inferred: '#56B6E0',
        slowing: '#E0A83E',
        starved: '#E45B4A',
        cyan: '#56B6E0',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glowmeasured: '0 0 0 4px rgba(63,179,139,0.12)',
        glowslowing: '0 0 0 4px rgba(224,168,62,0.14)',
        glowstarved: '0 0 0 4px rgba(228,91,74,0.16)',
        glowcyan: '0 0 0 3px rgba(86,182,224,0.18)',
      },
      keyframes: {
        pulseDot: {
          '0%,100%': { opacity: '1', boxShadow: '0 0 6px rgba(63,179,139,0.6)' },
          '50%': { opacity: '0.4', boxShadow: '0 0 2px rgba(63,179,139,0.2)' },
        },
        pulseDotCrit: {
          '0%,100%': { opacity: '1', boxShadow: '0 0 6px rgba(228,91,74,0.6)' },
          '50%': { opacity: '0.4', boxShadow: '0 0 2px rgba(228,91,74,0.2)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.8s ease-in-out infinite',
        pulseDotCrit: 'pulseDotCrit 1.2s ease-in-out infinite',
        sweep: 'sweep 1.1s linear infinite',
        riseIn: 'riseIn 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
