import { useMemo, useState } from 'react';
import { ALL_MODELS, CATEGORY_LABELS, LIBRARY_ORDER, searchModels } from '../sim/registry';
import { useLab } from '../store/lab';
import { Datasheet } from './Datasheet';
import { freeSpot, placementFor } from './placement';
import type { Category, ComponentModel } from '../sim/types';

export function LibraryView({ onBack }: { onBack: () => void }) {
  const lab = useLab();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [selected, setSelected] = useState<ComponentModel>(ALL_MODELS[0]);

  const results = useMemo(() => searchModels(query, category), [query, category]);

  const add = (m: ComponentModel) => {
    const spot = freeSpot(lab.circuit, m);
    const p = placementFor(lab.circuit, m, spot.x, spot.y);
    lab.addComponent(m.type, p.x, p.y, p.rot);
    onBack();
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[300px] shrink-0 flex-col border-r border-bench-800 bg-bench-900">
        <div className="panel-head">
          IC library
          <span className="ml-auto font-mono text-[10px] normal-case text-bench-600">
            {results.length}
          </span>
        </div>
        <div className="space-y-2 border-b border-bench-800 p-2">
          <input
            className="field"
            placeholder="Search by number, function or keyword"
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
        </div>
        <div className="scroll-y flex-1 p-1.5">
          {results.map((m) => (
            <button
              key={m.type}
              onClick={() => setSelected(m)}
              className={`mb-1 block w-full rounded-md border px-2.5 py-1.5 text-left transition ${
                selected.type === m.type
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-transparent hover:border-bench-700 hover:bg-bench-850'
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[12px] font-semibold text-bench-100">{m.label}</span>
                <span className="truncate text-[11px] text-bench-500">{m.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-y flex-1 bg-bench-950 p-5">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center gap-2">
            <button className="btn" onClick={onBack}>
              {'←'} Back to the bench
            </button>
            <button className="btn btn-primary ml-auto" onClick={() => add(selected)}>
              Put a {selected.label} on the bench
            </button>
          </div>
          <Datasheet model={selected} />
        </div>
      </div>
    </div>
  );
}
