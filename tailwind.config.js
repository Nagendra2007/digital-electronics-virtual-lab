/** @type {import('tailwindcss').Config} */

/** Channel-based so Tailwind opacity modifiers (bg-accent/15) keep working. */
const themed = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The "bench" scale runs from furthest back (950) to most prominent
        // text (50). Both themes define it, so every utility flips with them.
        bench: {
          950: themed('bench-950'),
          900: themed('bench-900'),
          850: themed('bench-850'),
          800: themed('bench-800'),
          700: themed('bench-700'),
          600: themed('bench-600'),
          500: themed('bench-500'),
          400: themed('bench-400'),
          300: themed('bench-300'),
          200: themed('bench-200'),
          100: themed('bench-100'),
          50: themed('bench-50'),
        },
        accent: {
          DEFAULT: themed('accent'),
          soft: themed('accent-soft'),
          fg: themed('accent-fg'),
        },
        // Status colours used by the checks panel, lamps and readouts.
        ok: themed('ok'),
        warn: themed('warn'),
        err: themed('err'),
        info: themed('info'),
        // Logic levels.
        high: themed('sig-high'),
        low: themed('sig-low'),
        float: themed('sig-float'),
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
