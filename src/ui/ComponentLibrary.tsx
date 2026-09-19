import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, LIBRARY_ORDER, getModel, searchModels } from '../sim/registry';
import { useLab } from '../store/lab';
import { freeSpot, placementFor } from './placement';
import type { Category, ComponentModel } from '../sim/types';

const QUICK: { type: string; label: string }[] = [
  { type: 'ic:7400', label: '7400' },
  { type: 'ic:7404', label: '7404' },
  { type: 'ic:7408', label: '7408' },
  { type: 'ic:7432', label: '7432' },
  { type: 'ic:7486', label: '7486' },
  { type: 'led', label: 'LED' },
  { type: 'clock', label: 'Clock' },
  { type: 'vcc', label: 'VCC' },
  { type: 'gnd', label: 'GND' },
];

export function ComponentLibrary({
  placing,
  setPlacing,
  onInspect,
  onAdded,
}: {
  placing: string | null;
  setPlacing: (t: string | null) => void;
  onInspect: (model: ComponentModel) => void;
  /** Called once a part is on the bench, so a phone can get out of the way. */
  onAdded: () => void;
}) {
  const lab = useLab();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');

  const groups = useMemo(() => {
    const found = searchModels(query, category);
    return LIBRARY_ORDER.map((cat) => ({
      cat,
      items: found.filter((m) => m.category === cat),
    })).filter((g) => g.items.length);
  }, [query, category]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const add = (type: string) => {
    const m = getModel(type);
    if (!m) return;
    const spot = freeSpot(lab.circuit, m);
    const p = placementFor(lab.circuit, m, spot.x, spot.y);
    lab.addComponent(type, p.x, p.y, p.rot);
    onAdded();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="panel-head">
        Component library
        <span className="ml-auto font-mono text-[10px] normal-case text-bench-600">{total} parts</span>
      </div>

      <div className="space-y-2 border-b border-bench-800 p-2">
        <input
          className="field"
          placeholder="Search 7400, counter, multiplexer..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          <button
            className={`btn btn-sm ${category === 'all' ? 'btn-active' : ''}`}
            onClick={() => setCategory('all')}
          >
            All
          </button>
          {LIBRARY_ORDER.map((c) => (
            <button
              key={c}
              className={`btn btn-sm ${category === c ? 'btn-active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {CATEGORY_LABELS[c].split(' ')[0]}
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-bench-600">Quick add</div>
          <div className="flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <button key={q.type} className="btn btn-sm" onClick={() => add(q.type)}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="scroll-y flex-1 p-2">
        {groups.map((g) => (
          <div key={g.cat} className="mb-3">
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-bench-500">
              {CATEGORY_LABELS[g.cat]}
            </div>
            <div className="space-y-1">
              {g.items.map((m) => (
                <div
                  key={m.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/component', m.type);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => setPlacing(placing === m.type ? null : m.type)}
                  className={`group cursor-grab rounded-md border px-2 py-1.5 transition ${
                    placing === m.type
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-bench-800 bg-bench-850/60 hover:border-bench-600 hover:bg-bench-800'
                  }`}
                  title={m.description}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-bench-100">{m.label}</span>
                    {m.pkg !== 'module' && (
                      <span className="chip py-0 text-[9px]">{m.pkg}</span>
                    )}
                    <div className="ml-auto flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        className="btn btn-sm px-1.5 py-0.5 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspect(m);
                        }}
                        title="Show the datasheet"
                      >
                        info
                      </button>
                      <button
                        className="btn btn-sm px-1.5 py-0.5 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          add(m.type);
                        }}
                        title="Put one on the bench"
                      >
                        add
                      </button>
                    </div>
                  </div>
                  <div className="truncate text-[11px] text-bench-400">{m.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!total && (
          <div className="p-4 text-center text-[12px] text-bench-500">
            Nothing matches &ldquo;{query}&rdquo;.
          </div>
        )}
      </div>

      <div className="border-t border-bench-800 p-2 text-[11px] leading-snug text-bench-500">
        Click a part to arm it, then click the bench to place it - or drag it straight across.
      </div>
    </div>
  );
}
