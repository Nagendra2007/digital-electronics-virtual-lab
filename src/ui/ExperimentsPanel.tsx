import { useState } from 'react';
import { EXPERIMENTS } from '../data/experiments';
import { BENCH, createComponent, getModel, newCircuit } from '../sim/registry';
import { boundsOf } from '../sim/geometry';
import { runCheck, verdict } from '../sim/verify';
import { useLab } from '../store/lab';
import type { Experiment } from '../data/experiments';
import type { CheckResult } from '../sim/verify';

export function ExperimentsPanel() {
  const lab = useLab();
  const [open, setOpen] = useState<Experiment | null>(lab.activeExperiment);
  const [result, setResult] = useState<CheckResult | null>(null);

  const start = (exp: Experiment) => {
    const circuit = newCircuit(`Exp ${exp.number} - ${exp.title}`);
    circuit.experimentId = exp.id;
    // Put the required parts on the bench, unwired. Building the circuit is
    // the point of the exercise, so nothing is connected for the student.
    // They go in the space between the two trainer panels - where the board
    // would be - wrapping onto a new row rather than piling up on the reader.
    const left = BENCH.board.x;
    const right = BENCH.reader.x - 40;
    let x = left;
    let y = BENCH.board.y + 20;
    let rowH = 0;
    for (const part of exp.parts) {
      const model = getModel(part.type);
      if (!model) continue;
      for (let i = 0; i < part.qty; i++) {
        const size = boundsOf(model, { id: '_', type: part.type, x: 0, y: 0, rot: 0, props: {} });
        if (x > left && x + size.w > right) {
          x = left;
          y += rowH + 70;
          rowH = 0;
        }
        const comp = createComponent(part.type, x, y, circuit);
        if (comp) {
          circuit.components.push(comp);
          x += size.w + 60;
          rowH = Math.max(rowH, size.h);
        }
      }
    }
    lab.replaceCircuit(circuit, exp);
    setResult(null);
    setOpen(exp);
  };

  const check = (exp: Experiment) => {
    if (!exp.check) return;
    setResult(runCheck(lab.circuit, exp.check));
  };

  if (open) {
    return (
      <div className="flex h-full flex-col">
        <div className="panel-head">
          <button className="btn btn-sm" onClick={() => setOpen(null)}>
            {'←'} All experiments
          </button>
          <span className="ml-auto font-mono text-[10px] normal-case text-bench-600">
            Experiment {open.number}
          </span>
        </div>

        <div className="scroll-y flex-1 space-y-4 p-3">
          <div>
            <h2 className="text-[15px] font-semibold text-bench-50">{open.title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-bench-300">{open.objective}</p>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => start(open)}>
              Start experiment
            </button>
            <button className="btn flex-1" onClick={() => check(open)} disabled={!open.check}>
              Check my circuit
            </button>
          </div>

          {result && <CheckReport result={result} />}

          <Section title="Theory">
            <p>{open.theory}</p>
          </Section>

          <Section title="Components required">
            <ul className="space-y-1">
              {open.parts.map((p, i) => {
                const model = getModel(p.type);
                return (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[11px] text-accent">{p.qty}&times;</span>
                    <span>
                      <span className="font-mono text-bench-100">{model?.label ?? p.type}</span>
                      {p.note ? <span className="text-bench-500"> &mdash; {p.note}</span> : null}
                    </span>
                  </li>
                );
              })}
              <li className="text-bench-500">
                Plus the Digital Writer, Digital Reader, VCC and GND already on the bench.
              </li>
            </ul>
          </Section>

          <Section title="Circuit requirements">
            <ul className="list-disc pl-4">
              {open.requirements.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </Section>

          <Section title="Pin configuration">
            <ul className="space-y-1 font-mono text-[11.5px]">
              {open.pinConfig.map((p, i) => (
                <li key={i} className="rounded border border-bench-800 bg-bench-900/60 px-2 py-1">
                  {p}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Procedure">
            <ol className="list-decimal space-y-1 pl-4">
              {open.procedure.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </Section>

          {open.truthTable && (
            <Section title="Truth table">
              <table className="tt">
                <thead>
                  <tr>
                    {open.truthTable.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {open.truthTable.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {open.truthTable.note && (
                <p className="mt-1 text-[11px] text-bench-500">{open.truthTable.note}</p>
              )}
            </Section>
          )}

          <Section title="Expected output">
            <p>{open.expected}</p>
          </Section>

          {open.tips?.length ? (
            <Section title="Tips">
              <ul className="list-disc pl-4">
                {open.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="panel-head">
        Digital electronics practicals
        <span className="ml-auto font-mono text-[10px] normal-case text-bench-600">
          {EXPERIMENTS.length} experiments
        </span>
      </div>
      <div className="scroll-y flex-1 p-2">
        {EXPERIMENTS.map((e) => (
          <button
            key={e.id}
            className={`mb-1 block w-full rounded-md border px-2.5 py-2 text-left transition ${
              lab.activeExperiment?.id === e.id
                ? 'border-accent/50 bg-accent/10'
                : 'border-bench-800 bg-bench-850/50 hover:border-bench-600 hover:bg-bench-800'
            }`}
            onClick={() => {
              setOpen(e);
              setResult(null);
            }}
          >
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-bench-800 font-mono text-[10px] text-bench-400">
                {e.number}
              </span>
              <span className="text-[12.5px] font-medium text-bench-100">{e.title}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 pl-7 text-[11px] leading-snug text-bench-500">
              {e.objective}
            </div>
          </button>
        ))}
      </div>
      <div className="border-t border-bench-800 p-2 text-[11px] leading-snug text-bench-500">
        Starting an experiment puts the required ICs on the bench, unwired. The wiring is yours to
        do - then press Check my circuit.
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-bench-500">
        {title}
      </div>
      <div className="prose-lab text-bench-300">{children}</div>
    </div>
  );
}

function CheckReport({ result }: { result: CheckResult }) {
  return (
    <div
      className={`rounded-md border p-2.5 ${
        result.ok ? 'border-ok/40 bg-ok/10' : 'border-warn/40 bg-warn/10'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[13px] font-semibold ${result.ok ? 'text-ok' : 'text-warn'}`}>
          {result.ok ? '✓ ' : '⚠ '}
          {verdict(result)}
        </span>
        <span className="ml-auto font-mono text-[11px] text-bench-400">
          {result.passed}/{result.total}
        </span>
      </div>

      {result.problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11.5px] text-warn">
          {result.problems.map((p, i) => (
            <li key={i}>&bull; {p}</li>
          ))}
        </ul>
      )}

      {result.rows.length > 0 && (
        <div className="mt-2 max-h-56 overflow-auto rounded border border-bench-800/80">
          <table className="tt">
            <thead>
              <tr>
                <th>Test</th>
                <th>Expected</th>
                <th>Measured</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i} className={r.pass ? '' : 'bg-err/10'}>
                  <td className="whitespace-nowrap text-bench-400">{r.label}</td>
                  <td className="whitespace-nowrap">{r.expected.join(' ')}</td>
                  <td className={`whitespace-nowrap ${r.pass ? 'text-ok' : 'text-err'}`}>
                    {r.actual.join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
