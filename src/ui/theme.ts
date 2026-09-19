import type { NetValue } from '../sim/types';
import type { CircuitEngine } from '../sim/engine';

/**
 * Colours are CSS custom properties so the whole bench - chrome and SVG alike -
 * flips between the light and dark palettes without re-rendering anything.
 * `var(--x)` is valid in an SVG presentation attribute, so these strings can be
 * handed straight to `fill=` and `stroke=`.
 */
export const COLORS = {
  high: 'var(--c-high)',
  low: 'var(--c-low)',
  float: 'var(--c-float)',
  z: 'var(--c-z)',
  vcc: 'var(--c-vcc)',
  gnd: 'var(--c-gnd)',
  idle: 'var(--c-idle)',
  accent: 'var(--c-accent)',
};

export function levelColor(v: NetValue): string {
  if (v === 1) return COLORS.high;
  if (v === 0) return COLORS.low;
  return COLORS.float;
}

export function levelText(v: NetValue): string {
  return v === 'X' ? 'X' : String(v);
}

/** Wire colouring: supply rails keep their conventional colours. */
export function netColor(engine: CircuitEngine, compId: string, pin: number): string {
  const net = engine.netStateAt(compId, pin);
  if (!net) return COLORS.idle;
  const idx = engine.netIndexOf(compId, pin);
  const pins = idx === undefined ? [] : (engine.netlist.nets[idx]?.pins ?? []);
  let hasVcc = false;
  let hasGnd = false;
  for (const key of pins) {
    const info = engine.netlist.pins.get(key);
    if (!info) continue;
    if (info.model.type === 'vcc') hasVcc = true;
    if (info.model.type === 'gnd') hasGnd = true;
  }
  if (hasVcc && !hasGnd && net.value === 1) return COLORS.vcc;
  if (hasGnd && !hasVcc && net.value === 0) return COLORS.gnd;
  return levelColor(net.value);
}

/** Insulation colours a student can pick for a wire. */
export const WIRE_COLORS = [
  '#0ea5e9',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
  '#f97316',
  '#64748b',
  '#111827',
];

export type ThemeName = 'light' | 'dark';

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
}
