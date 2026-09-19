/**
 * Three-valued logic (0, 1, X).
 *
 * `X` means "unknown" and is what a real gate gives you when an input is
 * floating: we refuse to guess. The rules below are the standard ones -
 * a gate only resolves to a definite level when a *controlling* input is
 * present (a 0 on an AND, a 1 on an OR), otherwise the unknown wins.
 */
import type { Logic, NetValue } from './types';

export const isDefined = (v: Logic): v is 0 | 1 => v === 0 || v === 1;

/** Normalise anything a pin might carry into a net value. */
export function toNet(v: Logic): NetValue {
  return v === 0 || v === 1 ? v : 'X';
}

export function and(...vals: NetValue[]): NetValue {
  let unknown = false;
  for (const v of vals) {
    if (v === 0) return 0; // controlling value
    if (v === 'X') unknown = true;
  }
  return unknown ? 'X' : 1;
}

export function or(...vals: NetValue[]): NetValue {
  let unknown = false;
  for (const v of vals) {
    if (v === 1) return 1; // controlling value
    if (v === 'X') unknown = true;
  }
  return unknown ? 'X' : 0;
}

export function not(v: NetValue): NetValue {
  if (v === 0) return 1;
  if (v === 1) return 0;
  return 'X';
}

export function nand(...vals: NetValue[]): NetValue {
  return not(and(...vals));
}

export function nor(...vals: NetValue[]): NetValue {
  return not(or(...vals));
}

export function xor(...vals: NetValue[]): NetValue {
  let acc: NetValue = 0;
  for (const v of vals) {
    if (v === 'X') return 'X'; // XOR has no controlling value
    acc = acc === v ? 0 : 1;
  }
  return acc;
}

export function xnor(...vals: NetValue[]): NetValue {
  return not(xor(...vals));
}

/** Build an unsigned integer from bits, LSB first. Returns -1 if any bit is unknown. */
export function bitsToInt(bits: NetValue[]): number {
  let n = 0;
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i];
    if (b === 'X') return -1;
    n |= b << i;
  }
  return n;
}

/** Extract bit `i` of `n` as a logic level. */
export const bitOf = (n: number, i: number): NetValue => ((n >> i) & 1) as 0 | 1;

export function fmt(v: Logic): string {
  if (v === 'X') return 'X';
  if (v === 'Z') return 'Z';
  return String(v);
}
