/**
 * Datasheet view: the pinout diagram, the pin table, the truth table and the
 * notes that matter when you are wiring the part up.
 */
import { layoutOf } from '../sim/geometry';
import type { ComponentModel, NetValue, PinDef } from '../sim/types';

const KIND_LABEL: Record<PinDef['kind'], string> = {
  input: 'input',
  output: 'output',
  power: 'power',
  ground: 'ground',
  clock: 'clock',
  nc: 'not connected',
  hole: 'tie point',
};

const KIND_STYLE: Record<PinDef['kind'], string> = {
  input: 'text-info',
  output: 'text-accent',
  power: 'text-err',
  ground: 'text-bench-400',
  clock: 'text-warn',
  nc: 'text-bench-600',
  hole: 'text-bench-500',
};

/** A flat, printable DIP pinout drawing. */
export function PinoutDiagram({ model }: { model: ComponentModel }) {
  if (model.pkg === 'module') return null;
  const l = layoutOf(model);
  const pad = 62;
  const w = l.w + pad * 2;

  return (
    <svg viewBox={`0 0 ${w} ${l.h + 16}`} className="w-full" style={{ maxHeight: 280 }}>
      <g transform={`translate(${pad} 8)`}>
        <rect x={l.bodyX} y={2} width={l.bodyW} height={l.h - 4} rx={4} fill="var(--ic-body)" stroke="var(--ic-body-edge)" />
        <path d={`M ${l.bodyX + l.bodyW / 2 - 8} 2 a 8 8 0 0 0 16 0 z`} fill="var(--ic-notch)" stroke="var(--ic-body-edge)" />
        <text
          x={l.bodyX + l.bodyW / 2}
          y={l.h / 2 + 5}
          textAnchor="middle"
          fontSize={15}
          fontFamily="ui-monospace, monospace"
          fill="var(--ic-text)"
          fontWeight={600}
        >
          {model.label}
        </text>
        {l.pins.map((p) => {
          const def = model.pins.find((d) => d.n === p.n)!;
          const left = p.side === 'L';
          const tipX = left ? -46 : l.w + 46;
          return (
            <g key={p.n}>
              <line
                x1={p.x}
                y1={p.y}
                x2={left ? l.bodyX : l.bodyX + l.bodyW}
                y2={p.y}
                stroke="var(--ic-leg)"
                strokeWidth={3}
              />
              <line x1={p.x} y1={p.y} x2={left ? tipX + 8 : tipX - 8} y2={p.y} stroke="var(--mod-edge)" strokeWidth={1} />
              <text
                x={left ? l.bodyX + 6 : l.bodyX + l.bodyW - 6}
                y={p.y + 3}
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                textAnchor={left ? 'start' : 'end'}
                fill="var(--pin-name)"
              >
                {p.n}
              </text>
              <text
                x={tipX}
                y={p.y + 3}
                fontSize={10}
                fontFamily="ui-monospace, monospace"
                textAnchor={left ? 'end' : 'start'}
                fill={
                  def.kind === 'power'
                    ? 'var(--pin-pwr)'
                    : def.kind === 'ground'
                      ? 'var(--pin-gnd)'
                      : def.kind === 'output'
                        ? 'var(--pin-out)'
                        : def.kind === 'nc'
                          ? 'var(--pin-nc)'
                          : 'var(--pin-in)'
                }
              >
                {def.name}
                {def.activeLow ? '̅' : ''}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function Datasheet({
  model,
  values,
}: {
  model: ComponentModel;
  /** Live pin levels, when the part is on the bench. */
  values?: (pin: number) => NetValue;
}) {
  const groups = new Map<string, PinDef[]>();
  for (const p of model.pins) {
    const key = p.group ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline gap-2">
          <h3 className="font-mono text-[16px] font-semibold text-bench-50">{model.label}</h3>
          <span className="chip">{model.pkg === 'module' ? 'module' : model.pkg}</span>
        </div>
        <div className="text-[12.5px] text-bench-300">{model.name}</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-bench-400">{model.description}</p>
      </div>

      {model.pkg !== 'module' && (
        <div className="rounded-md border border-bench-800 bg-bench-900/60 p-2">
          <PinoutDiagram model={model} />
          <div className="mt-1 text-center text-[10px] text-bench-600">
            Pin 1 is at the notch. VCC on pin {model.vccPin}, GND on pin {model.gndPin}.
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-bench-500">
          Pin functions
        </div>
        <div className="overflow-hidden rounded-md border border-bench-800">
          <table className="tt">
            <thead>
              <tr>
                <th className="w-10">Pin</th>
                <th className="w-20">Name</th>
                <th className="w-20">Type</th>
                <th>Function</th>
                {values && <th className="w-12">Level</th>}
              </tr>
            </thead>
            <tbody>
              {model.pins
                .filter((p) => p.kind !== 'hole')
                .map((p) => (
                  <tr key={p.n}>
                    <td className="text-bench-500">{p.n}</td>
                    <td className="font-semibold text-bench-100">
                      {p.name}
                      {p.activeLow ? '̅' : ''}
                    </td>
                    <td className={KIND_STYLE[p.kind]}>{KIND_LABEL[p.kind]}</td>
                    <td className="font-sans text-bench-400">{p.fn}</td>
                    {values && (
                      <td
                        className={
                          values(p.n) === 1
                            ? 'text-high'
                            : values(p.n) === 0
                              ? 'text-low'
                              : 'text-float'
                        }
                      >
                        {String(values(p.n))}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {model.pins.some((p) => p.kind === 'hole') && (
          <p className="mt-1 text-[11px] text-bench-500">
            {model.pins.length} tie points; each column of five and each rail is one node.
          </p>
        )}
      </div>

      {model.truthTable && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-bench-500">
            Truth table
          </div>
          <div className="overflow-hidden rounded-md border border-bench-800">
            <table className="tt">
              <thead>
                <tr>
                  {model.truthTable.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.truthTable.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {model.truthTable.note && (
            <p className="mt-1 text-[11px] text-bench-500">{model.truthTable.note}</p>
          )}
        </div>
      )}

      {model.notes?.length ? (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-bench-500">
            Notes for the bench
          </div>
          <ul className="space-y-1.5">
            {model.notes.map((n, i) => (
              <li
                key={i}
                className="rounded border border-bench-800 bg-bench-900/50 px-2 py-1.5 text-[12px] leading-snug text-bench-300"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
