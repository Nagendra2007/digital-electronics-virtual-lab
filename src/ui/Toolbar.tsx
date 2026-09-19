import { useState } from 'react';
import { ZOOM_MAX, ZOOM_MIN, useLab } from '../store/lab';
import { issueCounts } from '../sim/validate';
import { BENCH } from '../sim/registry';
import { downloadCircuit } from '../sim/storage';
import { findBoard } from './placement';
import type { Tool } from '../store/lab';
import type { ThemeName } from './theme';

const TOOLS: { id: Tool; label: string; hint: string; glyph: string }[] = [
  { id: 'select', label: 'Select', hint: 'Select and move parts (V)', glyph: '◱' },
  { id: 'wire', label: 'Wire', hint: 'Draw wires pin to pin (W)', glyph: '╱' },
  { id: 'delete', label: 'Delete', hint: 'Tap a part or wire to remove it', glyph: '✗' },
  { id: 'pan', label: 'Pan', hint: 'Drag the sheet around', glyph: '✚' },
];

export function Toolbar({
  onOpenFiles,
  view,
  onView,
  theme,
  onToggleTheme,
}: {
  onOpenFiles: () => void;
  view: 'bench' | 'library';
  onView: (v: 'bench' | 'library') => void;
  theme: ThemeName;
  onToggleTheme: () => void;
}) {
  const lab = useLab();
  const [renaming, setRenaming] = useState(false);
  const counts = issueCounts(lab.issues);
  const board = findBoard(lab.circuit);

  const toggleBoard = () => {
    if (board) {
      lab.deleteComponents([board.id]);
      lab.setSettings({ breadboard: false });
    } else {
      lab.addComponent('breadboard', BENCH.board.x, BENCH.board.y);
      lab.setSettings({ breadboard: true });
    }
    // Re-frame once the edit has landed, so the new board is in the picture.
    lab.requestFit();
  };

  return (
    <div className="flex items-center gap-1.5 border-b border-bench-800 bg-bench-900 px-2 py-1.5">
      {/* On a phone this strip scrolls sideways; on a wide screen it wraps. */}
      <div className="no-bar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto xl:flex-wrap xl:overflow-visible">
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent/15 text-[13px] font-bold text-accent">
            DL
          </div>
          <div className="hidden leading-tight lg:block">
            <div className="text-[12px] font-semibold text-bench-100">Digital Electronics Lab</div>
            <div className="text-[10px] text-bench-500">Virtual practical bench</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-bench-850 p-0.5">
          <button
            className={`btn btn-sm border-transparent bg-transparent shadow-none ${view === 'bench' ? 'btn-active' : ''}`}
            onClick={() => onView('bench')}
          >
            Bench
          </button>
          <button
            className={`btn btn-sm border-transparent bg-transparent shadow-none ${view === 'library' ? 'btn-active' : ''}`}
            onClick={() => onView('library')}
          >
            IC library
          </button>
        </div>

        <Sep />

        <button className="btn btn-sm" onClick={() => lab.resetBench()} title="Start a fresh bench">
          New
        </button>
        <button
          className="btn btn-sm"
          onClick={onOpenFiles}
          title="Save, load, rename, duplicate or delete circuits"
        >
          Files
        </button>
        <button
          className="btn btn-sm max-sm:hidden"
          onClick={() => downloadCircuit(lab.circuit)}
          title="Export this circuit as JSON"
        >
          Export
        </button>
        <button
          className="btn btn-sm btn-danger max-sm:hidden"
          onClick={() => {
            if (
              !lab.circuit.components.length ||
              window.confirm('Remove every part and wire from the bench? Undo will bring them back.')
            ) {
              lab.clearBench();
            }
          }}
          title="Strip the bench bare, keeping the circuit name"
        >
          Clear
        </button>

        <Sep />

        <button className="btn btn-sm" disabled={!lab.canUndo} onClick={lab.undo} title="Undo (Ctrl+Z)">
          {'↶'}
        </button>
        <button
          className="btn btn-sm"
          disabled={!lab.canRedo}
          onClick={lab.redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          {'↷'}
        </button>

        <Sep />

        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${lab.tool === t.id ? 'btn-active' : ''}`}
            onClick={() => lab.setTool(t.id)}
            title={t.hint}
          >
            <span className="text-[13px] leading-none">{t.glyph}</span>
            <span className="hidden xl:inline">{t.label}</span>
          </button>
        ))}

        <Sep />

        <button
          className="btn btn-sm"
          onClick={lab.rotateSelection}
          disabled={!lab.selection.length}
          title="Rotate the selection (R)"
        >
          {'↻'}
        </button>
        <button
          className="btn btn-sm max-sm:hidden"
          onClick={lab.duplicateSelection}
          disabled={!lab.selection.length}
          title="Duplicate the selection (Ctrl+D)"
        >
          {'⧉'}
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={lab.deleteSelection}
          disabled={!lab.selection.length && !lab.selectedWires.length}
          title="Delete the selection (Del)"
        >
          {'⌫'}
        </button>

        <Sep />

        <button
          className="btn btn-sm"
          onClick={() => lab.setView((v) => ({ ...v, zoom: Math.min(ZOOM_MAX, v.zoom * 1.15) }))}
          title="Zoom in"
        >
          +
        </button>
        <span className="w-10 shrink-0 text-center font-mono text-[11px] text-bench-500 max-sm:hidden">
          {Math.round(lab.view.zoom * 100)}%
        </span>
        <button
          className="btn btn-sm"
          onClick={() => lab.setView((v) => ({ ...v, zoom: Math.max(ZOOM_MIN, v.zoom / 1.15) }))}
          title="Zoom out"
        >
          {'−'}
        </button>
        <button
          className="btn btn-sm"
          onClick={lab.fitToContents}
          title="Frame everything on the bench"
        >
          Fit
        </button>
        <button
          className={`btn btn-sm max-sm:hidden ${lab.circuit.settings.grid ? 'btn-active' : ''}`}
          onClick={() => lab.setSettings({ grid: !lab.circuit.settings.grid })}
          title="Show the grid"
        >
          Grid
        </button>
        <button
          className={`btn btn-sm max-sm:hidden ${lab.circuit.settings.snap ? 'btn-active' : ''}`}
          onClick={() => lab.setSettings({ snap: !lab.circuit.settings.snap })}
          title="Snap parts to the grid"
        >
          Snap
        </button>
        <button
          className={`btn btn-sm ${lab.circuit.settings.autoRoute !== false ? 'btn-active' : ''}`}
          onClick={() => lab.setSettings({ autoRoute: lab.circuit.settings.autoRoute === false })}
          title="Route wires around the packages instead of straight across them"
        >
          Tidy wires
        </button>
        <button
          className={`btn btn-sm ${board ? 'btn-active' : ''}`}
          onClick={toggleBoard}
          title={board ? 'Remove the breadboard' : 'Work on a breadboard'}
        >
          Board
        </button>

        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          {counts.error > 0 && (
            <span className="chip border-err/40 bg-err/10 text-err">
              {counts.error} error{counts.error > 1 ? 's' : ''}
            </span>
          )}
          {counts.warn > 0 && (
            <span className="chip border-warn/40 bg-warn/10 text-warn">
              {counts.warn} warning{counts.warn > 1 ? 's' : ''}
            </span>
          )}
          {counts.error === 0 && counts.warn === 0 && lab.circuit.wires.length > 0 && (
            <span className="chip border-ok/30 bg-ok/10 text-ok">circuit ok</span>
          )}

          {renaming ? (
            <input
              autoFocus
              className="field w-44"
              defaultValue={lab.circuit.name}
              onBlur={(e) => {
                lab.rename(e.target.value.trim() || 'Untitled circuit');
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <button
              className="max-w-[150px] truncate rounded px-2 py-1 text-[12px] text-bench-300 hover:bg-bench-850 max-sm:hidden"
              onClick={() => setRenaming(true)}
              title="Rename this circuit"
            >
              {lab.circuit.name}
            </button>
          )}
        </div>
      </div>

      {/* Always reachable, never scrolled away. */}
      <div className="flex shrink-0 items-center gap-1.5 border-l border-bench-800 pl-1.5">
        <button
          className="btn btn-sm"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to the dark bench' : 'Switch to the light bench'}
        >
          {theme === 'light' ? '◑' : '◐'}
        </button>
        <button
          className={`btn btn-sm ${lab.running ? 'btn-active' : ''}`}
          onClick={lab.running ? lab.stop : lab.run}
          title={lab.running ? 'Stop the simulation' : 'Run the simulation'}
        >
          {lab.running ? '■' : '▶'}
          <span className="hidden sm:inline">{lab.running ? 'Stop' : 'Run'}</span>
        </button>
        <button className="btn btn-sm max-sm:hidden" onClick={lab.stepOnce} title="Advance one step">
          Step
        </button>
        <button className="btn btn-sm" onClick={lab.resetSim} title="Clear all stored logic state">
          Reset
        </button>
      </div>
    </div>
  );
}

const Sep = () => <div className="mx-0.5 h-5 w-px shrink-0 bg-bench-800" />;
