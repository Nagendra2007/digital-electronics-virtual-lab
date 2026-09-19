import { useMemo, useState } from 'react';
import { READER_FIRST, WRITER_CHANNELS } from '../sim/devices';
import { BENCH } from '../sim/registry';
import { useLab } from '../store/lab';
import { levelColor } from './theme';
import type { NetValue } from '../sim/types';

export function BenchPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const lab = useLab();
  const [tab, setTab] = useState<'bench' | 'analyzer'>('bench');

  return (
    <div className="flex flex-col border-t border-bench-800 bg-bench-900">
      <div className="flex items-center gap-1 px-1">
        <button className={`tab ${tab === 'bench' ? 'tab-on' : ''}`} onClick={() => setTab('bench')}>
          Bench I/O
        </button>
        <button
          className={`tab ${tab === 'analyzer' ? 'tab-on' : ''}`}
          onClick={() => setTab('analyzer')}
        >
          Logic analyzer
          {lab.probes.length > 0 && (
            <span className="ml-1 rounded-full bg-bench-700 px-1.5 text-[10px]">{lab.probes.length}</span>
          )}
        </button>
        <div className="flex-1" />
        <span className="hidden px-2 font-mono text-[10px] text-bench-600 sm:block">
          t = {(lab.engine.time / 1000).toFixed(2)} s &middot; {lab.engine.netlist.nets.length} nodes
          &middot; {lab.engine.last.steps} delta steps
        </span>
        <button className="btn btn-sm" onClick={onToggle}>
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div className="h-[34vh] max-h-[230px] min-h-[148px] overflow-hidden border-t border-bench-800">
          {tab === 'bench' ? <BenchIO /> : <Analyzer />}
        </div>
      )}
    </div>
  );
}

function BenchIO() {
  const lab = useLab();
  const writer = lab.circuit.components.find((c) => c.type === 'writer');
  const reader = lab.circuit.components.find((c) => c.type === 'reader');
  const clocks = lab.circuit.components.filter((c) => c.type === 'clock');

  const values: number[] = writer?.props.values ?? [];
  const setValues = (next: number[]) => writer && lab.setProps(writer.id, { values: next });

  const readerValues: NetValue[] = reader
    ? Array.from({ length: 8 }, (_, i) => lab.engine.valueAt(reader.id, i + 1))
    : [];

  const writerWord = values.reduce((n, v, i) => n | ((v ? 1 : 0) << i), 0);
  const readerWord = readerValues.every((v) => v !== 'X')
    ? readerValues.reduce((n: number, v, i) => n | ((v as number) << i), 0)
    : null;

  return (
    <div className="scroll-y flex h-full flex-col gap-3 p-3 lg:flex-row">
      <div className="min-w-0 flex-1 lg:min-w-[300px]">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-bench-400">
            Digital Writer
          </span>
          {writer ? (
            <>
              <span className="chip font-mono">
                {writerWord.toString(2).padStart(8, '0')} = {writerWord}
              </span>
              <button className="btn btn-sm" onClick={() => setValues(Array(WRITER_CHANNELS).fill(0))}>
                All 0
              </button>
              <button className="btn btn-sm" onClick={() => setValues(Array(WRITER_CHANNELS).fill(1))}>
                All 1
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => lab.addComponent('writer', BENCH.writer.x, BENCH.writer.y)}>
              Add the writer module
            </button>
          )}
        </div>

        {writer && (
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: WRITER_CHANNELS }, (_, i) => {
              const on = values[i] === 1;
              const wired =
                (lab.engine.netlist.nets[lab.engine.netIndexOf(writer.id, i + 1) ?? -1]?.pins.length ??
                  0) > 1;
              return (
                <button
                  key={i}
                  onClick={() => {
                    const next = [...values];
                    next[i] = on ? 0 : 1;
                    setValues(next);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-md border px-0.5 py-1.5 transition ${
                    on
                      ? 'border-high/60 bg-high/10'
                      : 'border-bench-700 bg-bench-850 hover:border-bench-600'
                  }`}
                  title={wired ? `D${i} is wired into the circuit` : `D${i} is not connected yet`}
                >
                  <span className={`font-mono text-[11px] ${wired ? 'text-bench-200' : 'text-bench-600'}`}>
                    D{i}
                  </span>
                  <span className={`lamp ${on ? 'lamp-1' : 'lamp-0'}`}>{on ? 1 : 0}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-px w-full shrink-0 bg-bench-800 lg:h-auto lg:w-px" />

      <div className="min-w-0 flex-1 lg:min-w-[300px]">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-bench-400">
            Digital Reader
          </span>
          {reader ? (
            <span className="chip font-mono">
              {readerValues.map((v) => (v === 'X' ? 'x' : v)).reverse().join('')}
              {readerWord !== null ? ` = ${readerWord}` : ''}
            </span>
          ) : (
            <button className="btn btn-sm" onClick={() => lab.addComponent('reader', BENCH.reader.x, BENCH.reader.y)}>
              Add the reader module
            </button>
          )}
        </div>

        {reader && (
          <div className="grid grid-cols-8 gap-1">
            {readerValues.map((v, i) => {
              const wired =
                (lab.engine.netlist.nets[lab.engine.netIndexOf(reader.id, i + 1) ?? -1]?.pins.length ??
                  0) > 1;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-1 rounded-md border px-0.5 py-1.5 ${
                    v === 1 ? 'border-ok/50 bg-ok/10' : 'border-bench-700 bg-bench-850'
                  }`}
                  title={wired ? '' : 'Nothing is wired to this channel'}
                >
                  <span className={`font-mono text-[11px] ${wired ? 'text-bench-200' : 'text-bench-600'}`}>
                    R{READER_FIRST + i}
                  </span>
                  <span className={`lamp ${v === 1 ? 'lamp-1' : v === 0 ? 'lamp-0' : 'lamp-x'}`}>
                    {v === 'X' ? 'X' : v}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-px w-full shrink-0 bg-bench-800 lg:h-auto lg:w-px" />

      <div className="min-w-0 lg:min-w-[220px]">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-bench-400">
            Clock
          </span>
          <button className="btn btn-sm" onClick={() => lab.addComponent('clock', BENCH.clock.x, BENCH.clock.y)}>
            Add
          </button>
        </div>
        {!clocks.length && (
          <p className="text-[11px] leading-snug text-bench-500">
            No clock on the bench. Add one to drive flip-flops and counters.
          </p>
        )}
        <div className="space-y-2">
          {clocks.map((c) => {
            const manual = c.props.mode === 'manual';
            const level = lab.engine.stateOf(c.id).level ?? 0;
            return (
              <div key={c.id} className="rounded-md border border-bench-700 bg-bench-850 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-mono text-[11px] text-bench-200">{c.label ?? 'CLK'}</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: levelColor(level as NetValue) }}
                  />
                  <button
                    className="btn btn-sm ml-auto"
                    onClick={() => lab.setProps(c.id, { mode: manual ? 'auto' : 'manual' })}
                  >
                    {manual ? 'Manual' : 'Auto'}
                  </button>
                </div>
                {manual ? (
                  <div className="flex gap-1">
                    <button
                      className="btn btn-sm flex-1"
                      onClick={() => lab.setProps(c.id, { level: c.props.level ? 0 : 1 })}
                    >
                      Toggle
                    </button>
                    <button
                      className="btn btn-sm flex-1"
                      onClick={() => {
                        lab.setProps(c.id, { level: 1 });
                        window.setTimeout(() => lab.setProps(c.id, { level: 0 }), 120);
                      }}
                    >
                      Pulse
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.2}
                      max={10}
                      step={0.1}
                      value={c.props.freq ?? 1}
                      onChange={(e) => lab.setProps(c.id, { freq: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="w-12 text-right font-mono text-[11px] text-bench-300">
                      {Number(c.props.freq ?? 1).toFixed(1)}Hz
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Analyzer() {
  const lab = useLab();
  const width = 900;
  const rowH = 30;

  const view = useMemo(() => {
    const samples = lab.samples;
    if (!samples.length || !lab.probes.length) return null;
    const span = 6000; // show the last six seconds
    const end = samples[samples.length - 1].t;
    const start = Math.max(0, end - span);
    const visible = samples.filter((s) => s.t >= start);
    const xOf = (t: number) => ((t - start) / Math.max(1, end - start)) * (width - 90) + 80;
    return { visible, xOf, start, end };
  }, [lab.samples, lab.probes.length]);

  if (!lab.probes.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-[12px] text-bench-400">
          No signals probed yet. Select a part and pick its pins under
          <span className="text-bench-200"> Probe a pin for the logic analyzer</span>.
        </p>
        <p className="max-w-lg text-[11px] leading-snug text-bench-600">
          The analyzer records the level of each probed node on every simulation step, which is the
          only sane way to watch a counter or a shift register actually work.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-bench-800 px-2 py-1">
        {lab.probes.map((p) => (
          <span key={p.id} className="chip gap-1 normal-case">
            {p.label}
            <button className="text-bench-500 hover:text-err" onClick={() => lab.removeProbe(p.id)}>
              &times;
            </button>
          </span>
        ))}
        <button className="btn btn-sm ml-auto" onClick={lab.clearSamples}>
          Clear trace
        </button>
      </div>

      <div className="scroll-y flex-1">
        <svg viewBox={`0 0 ${width} ${Math.max(60, lab.probes.length * rowH + 20)}`} className="w-full">
          {lab.probes.map((probe, i) => {
            const y = 14 + i * rowH;
            const hi = y + 4;
            const lo = y + 20;
            let d = '';
            let prev: NetValue | null = null;
            const bands: { x: number; w: number }[] = [];

            if (view) {
              view.visible.forEach((s, idx) => {
                const v = s.values[probe.id] ?? 'X';
                const x = view.xOf(s.t);
                const yy = v === 1 ? hi : v === 0 ? lo : (hi + lo) / 2;
                if (idx === 0) d = `M ${x} ${yy}`;
                else {
                  if (prev !== v) d += ` L ${x} ${prev === 1 ? hi : prev === 0 ? lo : (hi + lo) / 2}`;
                  d += ` L ${x} ${yy}`;
                }
                if (v === 'X') bands.push({ x, w: 4 });
                prev = v;
              });
            }

            const now = lab.engine.valueAt(probe.compId, probe.pin);
            return (
              <g key={probe.id}>
                <text x={6} y={y + 16} fontSize={10} fill="rgb(var(--bench-400))" fontFamily="ui-monospace, monospace">
                  {probe.label.slice(0, 12)}
                </text>
                <line x1={80} y1={lo} x2={width - 10} y2={lo} stroke="var(--scope-line)" />
                <line x1={80} y1={hi} x2={width - 10} y2={hi} stroke="var(--scope-line)" strokeDasharray="2 4" />
                {bands.map((b, j) => (
                  <rect key={j} x={b.x} y={hi} width={b.w} height={lo - hi} fill="var(--c-float)" opacity={0.3} />
                ))}
                <path d={d} fill="none" stroke={levelColor(now)} strokeWidth={1.8} />
                <text
                  x={width - 4}
                  y={y + 16}
                  fontSize={10}
                  textAnchor="end"
                  fill={levelColor(now)}
                  fontFamily="ui-monospace, monospace"
                >
                  {String(now)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="border-t border-bench-800 px-2 py-1 text-[10px] text-bench-600">
        Last {view ? ((view.end - view.start) / 1000).toFixed(1) : '0'} s &middot; sampled every
        simulation step while the circuit is running.
      </div>
    </div>
  );
}
