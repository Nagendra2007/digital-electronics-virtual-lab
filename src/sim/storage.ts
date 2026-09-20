/**
 * Saved circuits, kept in localStorage so the lab works with no backend.
 *
 * A circuit file is plain structured JSON - components, wires, settings - which
 * makes it easy to export, mail to a demonstrator, and import again.
 */
import { uid } from './registry';
import { defaultSettings } from './types';
import type { Circuit } from './types';

const KEY = 'dvl.circuits.v1';
const BENCH_KEY = 'dvl.bench.v1';
const PREFS_KEY = 'dvl.prefs.v1';

export const FILE_VERSION = 1;

function readAll(): Record<string, Circuit> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Circuit>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Circuit>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (err) {
    console.error('Could not save circuits', err);
  }
}

export function listCircuits(): Circuit[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveCircuit(circuit: Circuit): Circuit {
  const all = readAll();
  const saved: Circuit = { ...circuit, updatedAt: Date.now() };
  all[saved.id] = saved;
  writeAll(all);
  return saved;
}

export function loadCircuit(id: string): Circuit | null {
  return readAll()[id] ?? null;
}

export function deleteCircuit(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

export function renameCircuit(id: string, name: string) {
  const all = readAll();
  if (all[id]) {
    all[id] = { ...all[id], name, updatedAt: Date.now() };
    writeAll(all);
  }
}

export function duplicateCircuit(id: string): Circuit | null {
  const source = readAll()[id];
  if (!source) return null;
  const copy: Circuit = {
    ...structuredClone(source),
    id: uid('ckt'),
    name: `${source.name} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return saveCircuit(copy);
}

export function exportCircuit(circuit: Circuit): string {
  return JSON.stringify(
    {
      format: 'digital-electronics-virtual-lab',
      version: FILE_VERSION,
      circuit,
    },
    null,
    2,
  );
}

export function importCircuit(json: string): Circuit {
  const data = JSON.parse(json);
  const raw: Circuit = data?.circuit ?? data;
  if (!raw || !Array.isArray(raw.components) || !Array.isArray(raw.wires)) {
    throw new Error('That file does not look like a saved circuit.');
  }
  return {
    ...raw,
    id: uid('ckt'),
    name: raw.name ?? 'Imported circuit',
    settings: { ...defaultSettings(), ...(raw.settings ?? {}) },
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

export function downloadCircuit(circuit: Circuit) {
  const blob = new Blob([exportCircuit(circuit)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${circuit.name.replace(/[^\w\-]+/g, '_') || 'circuit'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The bench is autosaved so a refresh does not lose work in progress. */
export function saveBench(circuit: Circuit) {
  try {
    localStorage.setItem(BENCH_KEY, JSON.stringify(circuit));
  } catch {
    /* quota or private mode: the bench simply is not restored */
  }
}

export function loadBench(): Circuit | null {
  try {
    const raw = localStorage.getItem(BENCH_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Circuit;
    if (!Array.isArray(c.components)) return null;
    c.settings = { ...defaultSettings(), ...(c.settings ?? {}) };
    return c;
  } catch {
    return null;
  }
}

export function savePrefs(prefs: Record<string, unknown>) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadPrefs<T extends Record<string, unknown>>(fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
