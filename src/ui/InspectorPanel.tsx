import { useMemo, useState } from 'react';
import { getModel } from '../sim/registry';
import {
  detectInputs,
  detectOutputs,
  generateTruthTable,
  truthTableToCsv,
} from '../sim/truthtable';
import { useLab } from '../store/lab';
import { Datasheet } from './Datasheet';
import { WIRE_COLORS } from './theme';
import type { ComponentModel } from '../sim/types';
import type { Issue } from '../sim/validate';
import type { TTResult } from '../sim/truthtable';

type Tab = 'part' | 'checks' | 'table';

export function InspectorPanel({
  inspected,
  onInspect,
}: {
  inspected: ComponentModel | null;
  onInspect: (m: ComponentModel | null) => void;
}) {
  const lab = useLab();
  const [tab, setTab] = useState<Tab>('part');
  const selected = lab.selection.length === 1 ? lab.selection[0] : null;
  const comp = selected ? lab.circuit.components.find((c) => c.id === selected) : undefined;
  const model = comp ? getModel(comp.type) : inspected;

  const errors = lab.issues.filter((i) => i.level === 'error').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-bench-800 bg-bench-900 px-1">
        <button className={`tab ${tab === 'part' ? 'tab-on' : ''}`} onClick={() => setTab('part')}>
          Part
        </button>
        <button className={`tab ${tab === 'checks' ? 'tab-on' : ''}`} onClick={() => setTab('checks')}>
          Checks
          {errors > 0 && (
            <span className="ml-1 rounded-full bg-err px-1.5 text-[10px] font-semibold text-bench-900">{errors}</span>
          )}
        </button>
        <button className={`tab ${tab === 'table' ? 'tab-on' : ''}`} onClick={() => setTab('table')}>
          Truth table
        </button>
      </div>

      {tab === 'part' && (
        <div className="scroll-y flex-1 p-3">
          {lab.selectedWires.length === 1 ? (
            <WireProperties id={lab.selectedWires[0]} />
          ) : comp && model ? (
            <>
              <Properties compId={comp.id} />
              <div className="my-3 h-px bg-bench-800" />
              <Datasheet model={model} values={(pin) => lab.engine.valueAt(comp.id, pin)} />
            </>
          ) : model ? (
            <>
              <div className="mb-2 flex items-center gap-2 text-[11px] text-bench-500">
                From the library
                <button className="btn btn-sm ml-auto" onClick={() => onInspect(null)}>
                  clear
                </button>
              </div>
              <Datasheet model={model} />
            </>
          ) : (
            <Empty />
          )}
        </div>
      )}

      {tab === 'checks' && <ChecksTab />}
      {tab === 'table' && <TruthTableTab />}
    </div>
  );
}

function Empty() {
  return (
    <div className="space-y-3 p-2 text-[12px] leading-relaxed text-bench-500">
      <p className="text-bench-400">Select a part on the bench to see its datasheet here.</p>
      <ul className="space-y-1.5">
        <li>
          <b className="text-bench-300">Wiring:</b> click a pin, then click the pin you want to
          reach. Click empty space in between to put a corner in the wire.
        </li>
        <li>
          <b className="text-bench-300">Power:</b> every IC needs VCC and GND wired before it does
          anything - the Checks tab will tell you when you have missed one.
        </li>
        <li>
          <b className="text-bench-300">Reading:</b> wire an output to a Digital Reader channel, or
          drop a logic probe on any node.
        </li>
      </ul>
    </div>
  );
}

function Properties({ compId }: { compId: string }) {
  const lab = useLab();
  const comp = lab.circuit.components.find((c) => c.id === compId);
  if (!comp) return null;
  const model = getModel(comp.type);
  if (!model) return null;
  const set = (props: Record<string, unknown>) => lab.setProps(comp.id, props);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <label className="w-20 shrink-0 text-[11px] text-bench-500">Reference</label>
        <input
          className="field"
          value={comp.label ?? ''}
          onChange={(e) => lab.setLabel(comp.id, e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-bench-500">
        <span className="w-20 shrink-0">Position</span>
        <span className="font-mono text-bench-400">
          {comp.x}, {comp.y} &middot; {comp.rot}&deg;
        </span>
        <button className="btn btn-sm ml-auto" onClick={lab.rotateSelection}>
          Rotate
        </button>
      </div>

      {model.type === 'clock' && (
        <>
          <Row label="Mode">
            <select
              className="field"
              value={comp.props.mode ?? 'auto'}
              onChange={(e) => set({ mode: e.target.value })}
            >
              <option value="auto">Auto (free running)</option>
              <option value="manual">Manual (single steps)</option>
            </select>
          </Row>
          {comp.props.mode === 'manual' ? (
            <Row label="Level">
              <div className="flex gap-1">
                <button className="btn btn-sm flex-1" onClick={() => set({ level: comp.props.level ? 0 : 1 })}>
                  Toggle ({comp.props.level ? 'HIGH' : 'LOW'})
                </button>
                <button
                  className="btn btn-sm flex-1"
                  onClick={() => {
                    set({ level: 1 });
                    window.setTimeout(() => lab.setProps(comp.id, { level: 0 }), 120);
                  }}
                >
                  Pulse
                </button>
              </div>
            </Row>
          ) : (
            <>
              <Row label="Frequency">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.2}
                    max={10}
                    step={0.1}
                    value={comp.props.freq ?? 1}
                    onChange={(e) => set({ freq: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-14 text-right font-mono text-[11px] text-bench-300">
                    {Number(comp.props.freq ?? 1).toFixed(1)} Hz
                  </span>
                </div>
              </Row>
              <Row label="Period">
                <span className="font-mono text-[11px] text-bench-400">
                  {(1000 / Number(comp.props.freq ?? 1)).toFixed(0)} ms
                </span>
              </Row>
              <Row label="Duty">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={comp.props.duty ?? 50}
                    onChange={(e) => set({ duty: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-14 text-right font-mono text-[11px] text-bench-300">
                    {comp.props.duty ?? 50}%
                  </span>
                </div>
              </Row>
              <Row label="Running">
                <button
                  className={`btn btn-sm ${comp.props.running ? 'btn-active' : ''}`}
                  onClick={() => set({ running: !comp.props.running })}
                >
                  {comp.props.running ? 'Oscillating' : 'Stopped'}
                </button>
              </Row>
            </>
          )}
        </>
      )}

      {model.type === 'seg7' && (
        <Row label="Type">
          <select
            className="field"
            value={comp.props.common ?? 'anode'}
            onChange={(e) => set({ common: e.target.value })}
          >
            <option value="anode">Common anode (COM to +5 V)</option>
            <option value="cathode">Common cathode (COM to GND)</option>
          </select>
        </Row>
      )}

      {(model.type === 'led' || model.type === 'seg7') && (
        <Row label="Colour">
          <div className="flex gap-1">
            {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#f97316'].map((c) => (
              <button
                key={c}
                className="h-6 w-6 rounded border border-bench-700"
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
        </Row>
      )}

      {model.type === 'switch' && (
        <Row label="Position">
          <button className="btn btn-sm" onClick={() => set({ pos: comp.props.pos === 'a' ? 'b' : 'a' })}>
            {comp.props.pos === 'a' ? 'A (usually VCC)' : 'B (usually GND)'}
          </button>
        </Row>
      )}

      {model.type === 'resistor' && (
        <Row label="Value">
          <input
            className="field"
            type="number"
            value={comp.props.ohms ?? 330}
            onChange={(e) => set({ ohms: Number(e.target.value) })}
          />
        </Row>
      )}

      <div>
        <div className="mb-1 text-[11px] text-bench-500">Probe a pin for the logic analyzer</div>
        <div className="flex flex-wrap gap-1">
          {model.pins
            .filter((p) => p.kind === 'output' || p.kind === 'clock' || p.kind === 'input')
            .slice(0, 20)
            .map((p) => {
              const on = lab.probes.some((q) => q.compId === comp.id && q.pin === p.n);
              return (
                <button
                  key={p.n}
                  className={`btn btn-sm ${on ? 'btn-active' : ''}`}
                  onClick={() =>
                    on
                      ? lab.removeProbe(`${comp.id}:${p.n}`)
                      : lab.addProbe(comp.id, p.n, `${comp.label ?? model.label}.${p.name}`)
                  }
                >
                  {p.name}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function WireProperties({ id }: { id: string }) {
  const lab = useLab();
  const wire = lab.circuit.wires.find((w) => w.id === id);
  if (!wire) return null;
  const end = (ref: { c: string; p: number }) => {
    const info = lab.engine.netlist.pins.get(`${ref.c}:${ref.p}`);
    if (!info) return 'deleted part';
    return `${info.comp.label ?? info.model.label} pin ${ref.p} (${info.def.name})`;
  };
  const net = lab.engine.netStateAt(wire.a.c, wire.a.p);
  const value = lab.engine.valueAt(wire.a.c, wire.a.p);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-bench-50">Wire</h3>
        <span className="chip">selected</span>
      </div>

      <div className="space-y-1 rounded-md border border-bench-800 bg-bench-900/60 p-2 text-[12px]">
        <div className="text-bench-400">
          from <span className="font-mono text-bench-200">{end(wire.a)}</span>
        </div>
        <div className="text-bench-400">
          to <span className="font-mono text-bench-200">{end(wire.b)}</span>
        </div>
        <div className="flex items-center gap-2 pt-1 text-bench-400">
          level
          <span className="font-mono text-bench-100">{String(value)}</span>
          {net?.floating && <span className="text-warn">floating - nothing drives this node</span>}
          {net?.conflict && <span className="text-err">contention</span>}
        </div>
        {wire.pts.length > 0 && (
          <div className="text-bench-500">{wire.pts.length} corner{wire.pts.length > 1 ? 's' : ''}</div>
        )}
      </div>

      <Row label="Insulation">
        <div className="flex flex-wrap gap-1">
          {WIRE_COLORS.map((c) => (
            <button
              key={c}
              className={`h-6 w-6 rounded border ${
                wire.color === c ? 'border-accent' : 'border-bench-700'
              }`}
              style={{ background: c }}
              onClick={() => lab.setWireColor(wire.id, c)}
              title={c}
            />
          ))}
        </div>
      </Row>
      <p className="text-[11px] leading-snug text-bench-500">
        Wires are drawn in their logic level while
        <span className="text-bench-300"> Colour wires by logic level </span>
        is on, under Checks. Turn it off to see the insulation colours you chose.
      </p>

      <button className="btn btn-danger w-full" onClick={() => lab.deleteWire(wire.id)}>
        Remove this wire
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-20 shrink-0 text-[11px] text-bench-500">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ChecksTab() {
  const lab = useLab();
  const [open, setOpen] = useState<string | null>(null);
  const groups: { level: Issue['level']; title: string }[] = [
    { level: 'error', title: 'Problems to fix' },
    { level: 'warn', title: 'Warnings' },
    { level: 'info', title: 'Notes' },
    { level: 'ok', title: 'Checks that pass' },
  ];

  return (
    <div className="scroll-y flex-1 p-2.5">
      <div className="mb-3 rounded-md border border-bench-800 bg-bench-900/60 p-2">
        <div className="mb-1 text-[11px] font-semibold text-bench-300">Floating inputs</div>
        <select
          className="field"
          value={lab.circuit.settings.floatingMode}
          onChange={(e) => lab.setSettings({ floatingMode: e.target.value as 'undefined' | 'pulldown' })}
        >
          <option value="undefined">Undefined (honest: an open input reads X)</option>
          <option value="pulldown">Simplified (an open input reads 0)</option>
        </select>
        <p className="mt-1 text-[11px] leading-snug text-bench-500">
          Real TTL inputs float to an unreliable HIGH and pick up noise. Undefined mode refuses to
          guess, which is why a gate with an open input shows X.
        </p>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-bench-400">
          <input
            type="checkbox"
            checked={lab.showWireState}
            onChange={(e) => lab.setShowWireState(e.target.checked)}
          />
          Colour wires by logic level
        </label>
      </div>

      {groups.map((g) => {
        const items = lab.issues.filter((i) => i.level === g.level);
        if (!items.length) return null;
        return (
          <div key={g.level} className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-bench-500">
              {g.title} ({items.length})
            </div>
            <div className="space-y-1.5">
              {items.map((issue) => (
                <div key={issue.id} className={`issue issue-${issue.level} flex-col`}>
                  <div className="flex w-full items-start gap-2">
                    <span className="mt-[1px] shrink-0">
                      {issue.level === 'error'
                        ? '⚠'
                        : issue.level === 'warn'
                          ? '⚠'
                          : issue.level === 'ok'
                            ? '✓'
                            : 'i'}
                    </span>
                    <span className="flex-1">{issue.message}</span>
                    {issue.why && (
                      <button
                        className="btn btn-sm shrink-0 px-1.5 py-0 text-[10px]"
                        onClick={() => setOpen(open === issue.id ? null : issue.id)}
                      >
                        Why?
                      </button>
                    )}
                  </div>
                  {open === issue.id && issue.why && (
                    <p className="mt-2 border-t border-bench-700 pt-2 text-[11.5px] leading-relaxed opacity-90">
                      {issue.why}
                    </p>
                  )}
                  {issue.compId && (
                    <button
                      className="mt-1 self-start text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100"
                      onClick={() => lab.setSelection([issue.compId!])}
                    >
                      show the part
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!lab.issues.length && (
        <div className="p-3 text-center text-[12px] text-bench-500">
          Nothing to report yet. Place a part and start wiring.
        </div>
      )}
    </div>
  );
}

function TruthTableTab() {
  const lab = useLab();
  const [result, setResult] = useState<TTResult | null>(null);
  const [copied, setCopied] = useState(false);

  const detected = useMemo(() => {
    void lab.version;
    return {
      inputs: detectInputs(lab.circuit, lab.engine),
      outputs: detectOutputs(lab.circuit, lab.engine),
    };
  }, [lab.circuit, lab.engine, lab.version]);

  const generate = () => {
    setResult(generateTruthTable(lab.circuit, detected.inputs, detected.outputs));
    setCopied(false);
  };

  return (
    <div className="scroll-y flex-1 p-2.5">
      <p className="mb-2 text-[12px] leading-relaxed text-bench-400">
        Sweeps every combination of the connected writer channels through the circuit you have
        actually built, and records what the readers show.
      </p>

      <div className="mb-2 flex flex-wrap gap-1 text-[11px]">
        <span className="text-bench-500">Inputs:</span>
        {detected.inputs.length ? (
          detected.inputs.map((i) => (
            <span key={i.compId + i.label} className="chip">
              {i.label}
            </span>
          ))
        ) : (
          <span className="text-warn">none wired</span>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-1 text-[11px]">
        <span className="text-bench-500">Outputs:</span>
        {detected.outputs.length ? (
          detected.outputs.map((o) => (
            <span key={o.compId + o.label} className="chip">
              {o.label}
            </span>
          ))
        ) : (
          <span className="text-warn">none wired</span>
        )}
      </div>

      <div className="mb-3 flex gap-2">
        <button
          className="btn btn-primary flex-1"
          onClick={generate}
          disabled={!detected.inputs.length || !detected.outputs.length}
        >
          Generate truth table
        </button>
        {result && (
          <button
            className="btn"
            onClick={() => {
              navigator.clipboard?.writeText(truthTableToCsv(result));
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy CSV'}
          </button>
        )}
      </div>

      {result && (
        <div className="overflow-hidden rounded-md border border-bench-800">
          <table className="tt">
            <thead>
              <tr>
                {result.inputs.map((i) => (
                  <th key={i.compId + i.label} className="bg-info/5">
                    {i.label}
                  </th>
                ))}
                {result.outputs.map((o) => (
                  <th key={o.compId + o.label} className="bg-accent/5">
                    {o.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {row.inputs.map((v, j) => (
                    <td key={j} className="text-bench-400">
                      {v}
                    </td>
                  ))}
                  {row.outputs.map((v, j) => (
                    <td
                      key={j}
                      className={
                        v === 1 ? 'text-high' : v === 0 ? 'text-low' : 'text-float'
                      }
                    >
                      {String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result?.note && <p className="mt-2 text-[11px] text-warn">{result.note}</p>}
      {result && (
        <p className="mt-2 text-[11px] leading-snug text-bench-500">
          Each row is measured from scratch: the stored state is cleared, the inputs are applied and
          the circuit is allowed to settle, so a sequential circuit shows its power-on behaviour
          rather than a history.
        </p>
      )}
    </div>
  );
}
