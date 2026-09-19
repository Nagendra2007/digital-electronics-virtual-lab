import { useRef, useState } from 'react';
import {
  deleteCircuit,
  downloadCircuit,
  duplicateCircuit,
  importCircuit,
  listCircuits,
  loadCircuit,
  renameCircuit,
  saveCircuit,
} from '../sim/storage';
import { useLab } from '../store/lab';
import type { Circuit } from '../sim/types';

export function FilesDialog({ onClose }: { onClose: () => void }) {
  const lab = useLab();
  const [items, setItems] = useState<Circuit[]>(() => listCircuits());
  const [message, setMessage] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setItems(listCircuits());

  const save = () => {
    saveCircuit(lab.circuit);
    refresh();
    setMessage(`Saved "${lab.circuit.name}".`);
  };

  const open = (id: string) => {
    const c = loadCircuit(id);
    if (!c) return;
    lab.replaceCircuit(structuredClone(c));
    onClose();
  };

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const circuit = importCircuit(text);
      lab.replaceCircuit(circuit);
      saveCircuit(circuit);
      refresh();
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That file could not be read.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'var(--scrim)' }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg shadow-2xl">
        <div className="panel-head">
          Saved circuits
          <button className="btn btn-sm ml-auto" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-bench-800 p-3">
          <button className="btn btn-primary" onClick={save}>
            Save current circuit
          </button>
          <button className="btn" onClick={() => downloadCircuit(lab.circuit)}>
            Export as JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
          <div className="flex-1" />
          <span className="self-center font-mono text-[11px] text-bench-500">
            {items.length} saved
          </span>
        </div>

        {message && (
          <div className="border-b border-bench-800 bg-accent/5 px-3 py-1.5 text-[12px] text-accent">
            {message}
          </div>
        )}

        <div className="scroll-y flex-1 p-2">
          {!items.length && (
            <p className="p-6 text-center text-[12px] text-bench-500">
              Nothing saved yet. Circuits are stored in this browser, so they survive a refresh but
              do not travel between machines - use Export for that.
            </p>
          )}
          {items.map((c) => (
            <div
              key={c.id}
              className="mb-1 flex flex-wrap items-center gap-2 rounded-md border border-bench-800 bg-bench-850/60 px-3 py-2"
            >
              <div className="min-w-[160px] flex-1">
                <div className="text-[13px] text-bench-100">{c.name}</div>
                <div className="font-mono text-[10px] text-bench-500">
                  {c.components.length} parts &middot; {c.wires.length} wires &middot;{' '}
                  {new Date(c.updatedAt).toLocaleString()}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => open(c.id)}>
                Open
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  const name = window.prompt('New name', c.name);
                  if (name) {
                    renameCircuit(c.id, name);
                    refresh();
                  }
                }}
              >
                Rename
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  duplicateCircuit(c.id);
                  refresh();
                }}
              >
                Duplicate
              </button>
              <button className="btn btn-sm" onClick={() => downloadCircuit(c)}>
                Export
              </button>
              {confirmId === c.id ? (
                <button
                  className="btn btn-sm border-err/60 bg-err/15 text-err"
                  onClick={() => {
                    deleteCircuit(c.id);
                    setConfirmId(null);
                    refresh();
                  }}
                >
                  Really delete
                </button>
              ) : (
                <button className="btn btn-sm btn-danger" onClick={() => setConfirmId(c.id)}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
