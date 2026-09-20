import { useEffect, useState } from 'react';
import { LabProvider, useLab } from './store/lab';
import { Toolbar } from './ui/Toolbar';
import { ComponentLibrary } from './ui/ComponentLibrary';
import { ExperimentsPanel } from './ui/ExperimentsPanel';
import { InspectorPanel } from './ui/InspectorPanel';
import { Workspace } from './ui/Workspace';
import { BenchPanel } from './ui/BenchPanel';
import { FilesDialog } from './ui/FilesDialog';
import { LibraryView } from './ui/LibraryView';
import { useTheme } from './ui/useTheme';
import { usePageZoomLock } from './ui/usePageZoomLock';
import type { ComponentModel } from './sim/types';

/**
 * Panels are docked beside the workspace on a big screen and slide over it on
 * anything smaller. The inspector only opens itself on a screen wide enough to
 * spare the room - below that the bench comes first.
 */
function useScreen() {
  const read = () => ({
    wide: window.innerWidth >= 1024,
    roomy: window.innerWidth >= 1600,
    short: window.innerHeight < 760 || window.innerWidth < 1024,
  });
  const [screen, setScreen] = useState(read);
  useEffect(() => {
    const onResize = () => setScreen(read());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return screen;
}

function Lab() {
  const lab = useLab();
  const { wide, roomy, short } = useScreen();
  const { theme, toggle: toggleTheme } = useTheme();
  usePageZoomLock();
  const [view, setView] = useState<'bench' | 'library'>('bench');
  const [leftTab, setLeftTab] = useState<'parts' | 'experiments'>('parts');
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= 1024);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 1600);
  const [benchCollapsed, setBenchCollapsed] = useState(
    () => window.innerHeight < 760 || window.innerWidth < 1024,
  );
  const [files, setFiles] = useState(false);
  const [help, setHelp] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [inspected, setInspected] = useState<ComponentModel | null>(null);

  // The workspace keeps the room it needs: on a laptop the inspector stays out
  // of the way until it is asked for, and on a phone both panels do.
  useEffect(() => {
    setLeftOpen(wide);
    setRightOpen(roomy);
  }, [wide, roomy]);

  useEffect(() => {
    setBenchCollapsed(short);
  }, [short]);

  // Opening a part from the library should show its datasheet on the right.
  const inspect = (m: ComponentModel | null) => {
    setInspected(m);
    if (m) {
      lab.setSelection([]);
      setRightOpen(true);
    }
  };

  const drawer = (side: 'left' | 'right', open: boolean, children: React.ReactNode) =>
    wide ? (
      open ? (
        <aside
          className={`w-[296px] shrink-0 bg-bench-900 2xl:w-[340px] ${side === 'left' ? 'border-r' : 'border-l'} border-bench-800`}
        >
          {children}
        </aside>
      ) : null
    ) : open ? (
      <>
        <div
          className="fixed inset-0 z-30" style={{ background: 'var(--scrim)' }}
          onClick={() => (side === 'left' ? setLeftOpen(false) : setRightOpen(false))}
        />
        <aside
          className={`fixed ${side}-0 bottom-0 top-0 z-40 w-[min(340px,88vw)] bg-bench-900 shadow-2xl ${
            side === 'left' ? 'border-r' : 'border-l'
          } border-bench-800`}
        >
          {children}
        </aside>
      </>
    ) : null;

  return (
    <div className="flex h-full flex-col bg-bench-950">
      <Toolbar
        onOpenFiles={() => setFiles(true)}
        view={view}
        onView={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {view === 'library' ? (
        <div className="min-h-0 flex-1">
          <LibraryView onBack={() => setView('bench')} />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            {drawer(
              'left',
              leftOpen,
              <div className="flex h-full flex-col">
                <div className="flex items-center border-b border-bench-800 px-1">
                  <button
                    className={`tab ${leftTab === 'parts' ? 'tab-on' : ''}`}
                    onClick={() => setLeftTab('parts')}
                  >
                    Parts
                  </button>
                  <button
                    className={`tab ${leftTab === 'experiments' ? 'tab-on' : ''}`}
                    onClick={() => setLeftTab('experiments')}
                  >
                    Experiments
                  </button>
                  {!wide && (
                    <button className="btn btn-sm ml-auto mr-1" onClick={() => setLeftOpen(false)}>
                      close
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  {leftTab === 'parts' ? (
                    <ComponentLibrary
                      placing={placing}
                      setPlacing={(t) => {
                        setPlacing(t);
                        if (!wide) setLeftOpen(false);
                      }}
                      onInspect={inspect}
                      onAdded={() => {
                        if (!wide) setLeftOpen(false);
                      }}
                    />
                  ) : (
                    <ExperimentsPanel />
                  )}
                </div>
              </div>,
            )}

            <main className="relative min-w-0 flex-1">
              <Workspace placing={placing} onPlaced={() => setPlacing(null)} />

              <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-between px-2">
                <button
                  className="btn btn-sm pointer-events-auto shadow-lg"
                  onClick={() => setLeftOpen((v) => !v)}
                  title="Parts and experiments"
                >
                  {leftOpen && wide ? '◀' : '▶'} Parts
                </button>
                <div className="pointer-events-auto flex gap-1">
                  <button className="btn btn-sm shadow-lg" onClick={() => setHelp(true)}>
                    ?
                  </button>
                  <button
                    className="btn btn-sm shadow-lg"
                    onClick={() => setRightOpen((v) => !v)}
                    title="Inspector, checks and truth table"
                  >
                    Inspector {rightOpen && wide ? '▶' : '◀'}
                  </button>
                </div>
              </div>
            </main>

            {drawer(
              'right',
              rightOpen,
              <div className="flex h-full flex-col">
                {!wide && (
                  <div className="flex justify-end border-b border-bench-800 p-1">
                    <button className="btn btn-sm" onClick={() => setRightOpen(false)}>
                      close
                    </button>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <InspectorPanel inspected={inspected} onInspect={setInspected} />
                </div>
              </div>,
            )}
          </div>

          <BenchPanel collapsed={benchCollapsed} onToggle={() => setBenchCollapsed((v) => !v)} />
        </>
      )}

      {files && <FilesDialog onClose={() => setFiles(false)} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'var(--scrim)' }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel max-h-[85vh] w-full max-w-xl overflow-auto rounded-lg p-0 shadow-2xl">
        <div className="panel-head">
          How this bench works
          <button className="btn btn-sm ml-auto" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="prose-lab space-y-4 p-4">
          <div>
            <h3 className="mb-1 text-[13px] font-semibold text-bench-100">Building a circuit</h3>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Pick an IC from the Parts list - click it, then click the bench.</li>
              <li>
                Wire VCC and GND to the package first. Nothing in a TTL circuit works until it is
                powered, and the Checks tab will keep reminding you.
              </li>
              <li>
                Switch to the <strong>Wire</strong> tool, then click a pin and click another pin
                to run a wire between them. Switch back to <strong>Select</strong> to move parts.
              </li>
              <li>Drive inputs from the Digital Writer (D0-D7) and read outputs on R8-R15.</li>
              <li>Press Run and flip the writer switches.</li>
            </ol>
          </div>
          <div>
            <h3 className="mb-1 text-[13px] font-semibold text-bench-100">Wires</h3>
            <p>
              Wiring is a mode: pick the <strong>Wire</strong> tool first. Then drag from one pin
              to another, or click a pin, click empty space to put a corner in, and click the
              destination pin. Esc or right-click cancels. Outside wire mode a pin is just part of
              the package, so dragging a breadboard moves the view instead of starting a wire.
              Wires are coloured by level: red is HIGH, blue is LOW, and an animated amber dash
              means the node is floating - nothing is driving it.
            </p>
            <p className="mt-1">
              Each wire routes itself around the packages, the way you would push a jumper flat
              across a board, and wires sharing a corridor spread into separate lanes. Turn
              <strong> Tidy wires</strong> off in the toolbar to place every corner yourself.
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-[13px] font-semibold text-bench-100">Breadboard</h3>
            <p>
              Turn on Breadboard in the toolbar. Drop an IC near the centre channel and it will
              straddle it with its legs in the holes, exactly as it would on your bench. Each column
              of five holes is one node; the long rails are the supply buses and are dead until you
              wire VCC and GND to them.
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-[13px] font-semibold text-bench-100">Keyboard</h3>
            <ul className="grid grid-cols-2 gap-1 font-mono text-[11.5px]">
              <li>V - select tool</li>
              <li>W - wire tool</li>
              <li>R - rotate</li>
              <li>Del - delete selection</li>
              <li>Ctrl+D - duplicate</li>
              <li>Ctrl+Z / Ctrl+Shift+Z - undo / redo</li>
              <li>Ctrl+wheel / Ctrl+ +- - zoom the bench</li>
              <li>Wheel / Alt+drag - pan</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LabProvider>
      <Lab />
    </LabProvider>
  );
}
