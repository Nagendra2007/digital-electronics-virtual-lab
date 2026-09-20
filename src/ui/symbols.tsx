/**
 * How every part is drawn on the bench.
 *
 * ICs are drawn as real dual-in-line packages: notch, legs, silkscreen part
 * number and the datasheet pin names, with pin 1 where pin 1 actually is.
 * Every colour comes from a CSS variable, so the whole bench follows the
 * light/dark theme without re-rendering.
 */
import { memo } from 'react';
import { layoutOf, transformOf } from '../sim/geometry';
import { BB, BB_COLS, BB_H, BB_ROWS, BB_W, holeX } from '../sim/breadboard';
import { READER_FIRST, SEG_NAMES, WRITER_CHANNELS } from '../sim/devices';
import { COLORS, levelColor, levelText } from './theme';
import type { CircuitEngine } from '../sim/engine';
import type { ComponentModel, NetValue, PlacedComponent } from '../sim/types';

/** Themed colours, as CSS variables usable straight in SVG attributes. */
const V = {
  icBody: 'var(--ic-body)',
  icEdge: 'var(--ic-body-edge)',
  icTop: 'var(--ic-top)',
  icNotch: 'var(--ic-notch)',
  icSub: 'var(--ic-sub)',
  leg: 'var(--ic-leg)',
  pinIn: 'var(--pin-in)',
  pinOut: 'var(--pin-out)',
  pinPwr: 'var(--pin-pwr)',
  pinGnd: 'var(--pin-gnd)',
  pinNc: 'var(--pin-nc)',
  pinName: 'var(--pin-name)',
  pinRing: 'var(--pin-ring)',
  modBody: 'var(--mod-body)',
  modEdge: 'var(--mod-edge)',
  modInset: 'var(--mod-inset)',
  modSlot: 'var(--mod-slot)',
  modText: 'var(--mod-text)',
  barWriter: 'var(--bar-writer)',
  barReader: 'var(--bar-reader)',
  barClock: 'var(--bar-clock)',
  barSwitch: 'var(--bar-switch)',
  barDisplay: 'var(--bar-display)',
  lead: 'var(--lead)',
  boardBody: 'var(--board-body)',
  boardEdge: 'var(--board-edge)',
  boardHole: 'var(--board-hole)',
  boardHoleEdge: 'var(--board-hole-edge)',
  boardChannel: 'var(--board-channel)',
  boardMark: 'var(--board-mark)',
  boardPlus: 'var(--board-plus)',
  boardMinus: 'var(--board-minus)',
  segOff: 'var(--seg-off)',
  segBg: 'var(--seg-bg)',
  high: 'var(--c-high)',
  low: 'var(--c-low)',
  gnd: 'var(--c-gnd)',
  vcc: 'var(--c-vcc)',
  ok: 'rgb(var(--ok))',
  warn: 'rgb(var(--warn))',
};

export interface ShapeProps {
  comp: PlacedComponent;
  model: ComponentModel;
  engine: CircuitEngine;
  selected: boolean;
  hoverPin: number | null;
  wireMode: boolean;
  onProps: (props: Record<string, unknown>) => void;
}

const stop = (e: React.PointerEvent) => {
  e.stopPropagation();
};

/** Counter-rotate a label so text stays upright whatever the package rotation. */
function Upright({
  rot,
  x,
  y,
  children,
}: {
  rot: number;
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  if (!rot) return <>{children}</>;
  return <g transform={`rotate(${-rot} ${x} ${y})`}>{children}</g>;
}

function PinDot({
  n,
  x,
  y,
  value,
  hover,
  wireMode,
}: {
  n: number;
  x: number;
  y: number;
  value: NetValue;
  hover: boolean;
  wireMode: boolean;
}) {
  return (
    <>
      {(hover || wireMode) && (
        <circle cx={x} cy={y} r={hover ? 9 : 6.5} fill={COLORS.accent} opacity={hover ? 0.3 : 0.12} />
      )}
      <circle
        cx={x}
        cy={y}
        r={3.6}
        data-pin={n}
        fill={levelColor(value)}
        stroke={V.pinRing}
        strokeWidth={1}
        className="pin-hit"
      />
    </>
  );
}

const pinNameColor = (kind: string) =>
  kind === 'power'
    ? V.pinPwr
    : kind === 'ground'
      ? V.pinGnd
      : kind === 'output'
        ? V.pinOut
        : kind === 'nc'
          ? V.pinNc
          : V.pinName;

// --------------------------------------------------------------------- DIP

const DipShape = ({ comp, model, engine, hoverPin, wireMode }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const cx = l.bodyX + l.bodyW / 2;
  const cy = l.h / 2;

  return (
    <g>
      {l.pins.map((p) => {
        const inner = p.side === 'L' ? l.bodyX : l.bodyX + l.bodyW;
        return (
          <line
            key={`leg${p.n}`}
            x1={p.x}
            y1={p.y}
            x2={inner}
            y2={p.y}
            stroke={V.leg}
            strokeWidth={5}
            strokeLinecap="round"
          />
        );
      })}

      <rect
        x={l.bodyX}
        y={l.bodyY + 2}
        width={l.bodyW}
        height={l.h - 4}
        rx={5}
        fill={V.icBody}
        stroke={V.icEdge}
      />
      <rect
        x={l.bodyX + 3}
        y={l.bodyY + 5}
        width={l.bodyW - 6}
        height={9}
        rx={4}
        fill={V.icTop}
        opacity={0.55}
      />
      {/* The notch marks the pin 1 end, exactly as on the real package. */}
      <path
        d={`M ${cx - 9} ${l.bodyY + 2} a 9 9 0 0 0 18 0 z`}
        fill={V.icNotch}
        stroke={V.icEdge}
      />

      <Upright rot={comp.rot} x={cx} y={cy}>
        <text className="ic-label" x={cx} y={cy - 3} fontSize={16} textAnchor="middle">
          {model.label}
        </text>
        <text
          x={cx}
          y={cy + 13}
          fontSize={8}
          textAnchor="middle"
          fill={V.icSub}
          fontFamily="ui-monospace, monospace"
        >
          {comp.label ?? ''}
        </text>
      </Upright>

      {l.pins.map((p) => {
        const def = model.pins.find((d) => d.n === p.n)!;
        const left = p.side === 'L';
        const nameX = left ? l.bodyX + 7 : l.bodyX + l.bodyW - 7;
        const numX = left ? p.x + 3 : p.x - 3;
        // Pin names run along the package, as they do on a real chip - but
        // never upside down, which is what a half-turn would otherwise give.
        const flip = comp.rot === 180 || comp.rot === 270;
        return (
          <g key={p.n}>
            <Upright rot={comp.rot} x={numX} y={p.y}>
              <text className="pin-num" x={numX} y={p.y - 4} textAnchor={left ? 'start' : 'end'}>
                {p.n}
              </text>
            </Upright>
            <text
              className="pin-name"
              x={nameX}
              y={p.y + 3}
              transform={flip ? `rotate(180 ${nameX} ${p.y})` : undefined}
              textAnchor={left !== flip ? 'start' : 'end'}
              opacity={def.kind === 'nc' ? 0.45 : 1}
              fill={pinNameColor(def.kind)}
            >
              {def.name}
              {def.activeLow ? '̅' : ''}
            </text>
            <PinDot
              n={p.n}
              x={p.x}
              y={p.y}
              value={engine.valueAt(comp.id, p.n)}
              hover={hoverPin === p.n}
              wireMode={wireMode}
            />
          </g>
        );
      })}
    </g>
  );
};

// ----------------------------------------------------------------- modules

function ModuleFrame({
  l,
  title,
  bar,
  rot,
}: {
  l: ReturnType<typeof layoutOf>;
  title: string;
  bar: string;
  rot: number;
}) {
  return (
    <>
      <rect
        x={0}
        y={0}
        width={l.w}
        height={l.h}
        rx={8}
        fill={V.modBody}
        stroke={V.modEdge}
        strokeWidth={1.5}
      />
      <path
        d={`M 0 8 a 8 8 0 0 1 8 -8 L ${l.w - 8} 0 a 8 8 0 0 1 8 8 L ${l.w} 22 L 0 22 Z`}
        fill={bar}
      />
      <Upright rot={rot} x={l.w / 2} y={11}>
        <text className="module-title" x={l.w / 2} y={15} textAnchor="middle">
          {title}
        </text>
      </Upright>
    </>
  );
}

const WriterShape = ({ comp, model, engine, hoverPin, wireMode, onProps }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const values: number[] = comp.props.values ?? Array(WRITER_CHANNELS).fill(0);

  return (
    <g>
      <ModuleFrame l={l} title="DIGITAL WRITER" bar={V.barWriter} rot={comp.rot} />
      {l.pins.map((p, i) => {
        const on = values[i] === 1;
        return (
          <g key={p.n}>
            <text className="part-label" x={12} y={p.y + 4} fontSize={10}>
              D{i}
            </text>
            <g
              onPointerDown={(e) => {
                stop(e);
                const next = [...values];
                next[i] = on ? 0 : 1;
                onProps({ values: next });
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={34}
                y={p.y - 7}
                width={38}
                height={14}
                rx={7}
                fill={on ? V.high : V.modSlot}
                opacity={on ? 0.9 : 1}
                stroke={on ? V.high : V.modEdge}
              />
              <circle cx={on ? 65 : 41} cy={p.y} r={5.5} fill={on ? '#fff' : V.lead} />
            </g>
            <text
              x={84}
              y={p.y + 4}
              className="part-label"
              fill={on ? V.high : V.modText}
              fontSize={11}
            >
              {on ? '1' : '0'}
            </text>
            <circle
              cx={104}
              cy={p.y}
              r={4.5}
              fill={on ? V.high : V.modSlot}
              stroke={on ? 'none' : V.modEdge}
              className={on ? 'led-glow' : ''}
              color={V.high}
            />
            <line x1={112} y1={p.y} x2={l.w} y2={p.y} stroke={V.lead} strokeWidth={2} />
            <PinDot
              n={p.n}
              x={p.x}
              y={p.y}
              value={engine.valueAt(comp.id, p.n)}
              hover={hoverPin === p.n}
              wireMode={wireMode}
            />
          </g>
        );
      })}
    </g>
  );
};

const ReaderShape = ({ comp, model, engine, hoverPin, wireMode }: ShapeProps) => {
  const l = layoutOf(model, comp);
  return (
    <g>
      <ModuleFrame l={l} title="DIGITAL READER" bar={V.barReader} rot={comp.rot} />
      {l.pins.map((p, i) => {
        const v = engine.valueAt(comp.id, p.n);
        return (
          <g key={p.n}>
            <line x1={p.x} y1={p.y} x2={22} y2={p.y} stroke={V.lead} strokeWidth={2} />
            <circle
              cx={34}
              cy={p.y}
              r={5.5}
              fill={v === 1 ? V.ok : v === 0 ? V.modSlot : 'none'}
              stroke={v === 1 ? V.ok : v === 'X' ? V.warn : V.modEdge}
              strokeWidth={v === 'X' ? 1.5 : 1}
              className={v === 1 ? 'led-glow' : ''}
              color={V.ok}
            />
            <text className="part-label" x={48} y={p.y + 4} fontSize={10}>
              R{READER_FIRST + i}
            </text>
            <rect
              x={l.w - 46}
              y={p.y - 8}
              width={28}
              height={16}
              rx={4}
              fill={V.modInset}
              stroke={v === 'X' ? V.warn : V.modEdge}
              opacity={v === 'X' ? 0.9 : 1}
            />
            <text
              x={l.w - 32}
              y={p.y + 4}
              textAnchor="middle"
              fontSize={11}
              fontFamily="ui-monospace, monospace"
              fill={v === 1 ? V.ok : v === 0 ? V.modText : V.warn}
            >
              {levelText(v)}
            </text>
            <PinDot
              n={p.n}
              x={p.x}
              y={p.y}
              value={v}
              hover={hoverPin === p.n}
              wireMode={wireMode}
            />
          </g>
        );
      })}
    </g>
  );
};

const RailShape = ({ comp, model, engine, hoverPin, wireMode }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const isVcc = model.type === 'vcc';
  const p = l.pins[0];
  const color = isVcc ? V.vcc : V.gnd;
  return (
    <g>
      <rect
        x={0}
        y={isVcc ? 0 : 6}
        width={l.w}
        height={l.h - 6}
        rx={7}
        fill={V.modBody}
        stroke={color}
        strokeWidth={1.8}
      />
      <Upright rot={comp.rot} x={l.w / 2} y={l.h / 2}>
        <text
          x={l.w / 2}
          y={isVcc ? l.h / 2 + 2 : l.h / 2 + 8}
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          fontFamily="ui-monospace, monospace"
          fill={color}
        >
          {isVcc ? '+5V' : 'GND'}
        </text>
      </Upright>
      <line
        x1={p.x}
        y1={isVcc ? l.h - 6 : 6}
        x2={p.x}
        y2={p.y}
        stroke={color}
        strokeWidth={2.5}
      />
      <PinDot
        n={1}
        x={p.x}
        y={p.y}
        value={engine.valueAt(comp.id, 1)}
        hover={hoverPin === 1}
        wireMode={wireMode}
      />
    </g>
  );
};

const LedShape = ({ comp, model, engine, hoverPin, wireMode }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const on = engine.stateOf(comp.id).on === true;
  const color = (comp.props.color as string) ?? '#ef4444';
  return (
    <g>
      {l.pins.map((p) => (
        <line
          key={p.n}
          x1={p.x}
          y1={p.y}
          x2={p.x}
          y2={32}
          stroke={V.leg}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ))}
      <path
        d="M 16 32 L 16 18 a 14 14 0 0 1 28 0 L 44 32 Z"
        fill={on ? color : V.modSlot}
        stroke={on ? color : V.modEdge}
        strokeWidth={1.5}
        className={on ? 'led-glow' : ''}
        color={color}
      />
      {on && <ellipse cx={26} cy={19} rx={5} ry={4} fill="#fff" opacity={0.6} />}
      <text x={10} y={48} className="part-label" fontSize={8} textAnchor="middle">
        A
      </text>
      <text x={50} y={48} className="part-label" fontSize={8} textAnchor="middle">
        K
      </text>
      {l.pins.map((p) => (
        <PinDot
          key={`d${p.n}`}
          n={p.n}
          x={p.x}
          y={p.y}
          value={engine.valueAt(comp.id, p.n)}
          hover={hoverPin === p.n}
          wireMode={wireMode}
        />
      ))}
    </g>
  );
};

const SwitchShape = ({ comp, model, engine, hoverPin, wireMode, onProps }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const momentary = model.type === 'pushbutton';
  const on = momentary ? comp.props.pressed === true : comp.props.pos === 'a';

  return (
    <g>
      {l.pins.map((p) => (
        <line
          key={`l${p.n}`}
          x1={p.x}
          y1={44}
          x2={p.x}
          y2={p.y}
          stroke={V.leg}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ))}
      <rect x={6} y={2} width={l.w - 12} height={44} rx={6} fill={V.modBody} stroke={V.modEdge} strokeWidth={1.5} />
      <text x={l.w / 2} y={12} textAnchor="middle" className="part-label" fontSize={7} fill={V.modText}>
        {momentary ? 'PUSH' : 'SPDT'}
      </text>

      <g
        style={{ cursor: 'pointer' }}
        onPointerDown={(e) => {
          stop(e);
          if (momentary) onProps({ pressed: true });
          else onProps({ pos: on ? 'b' : 'a' });
        }}
        onPointerUp={() => momentary && onProps({ pressed: false })}
        onPointerLeave={() => momentary && comp.props.pressed && onProps({ pressed: false })}
      >
        {momentary ? (
          <>
            <circle cx={l.w / 2} cy={28} r={11} fill={V.modSlot} stroke={V.modEdge} />
            <circle cx={l.w / 2} cy={28} r={on ? 6 : 8} fill={on ? V.high : V.lead} />
          </>
        ) : (
          <>
            <rect x={22} y={18} width={36} height={20} rx={4} fill={V.modSlot} stroke={V.modEdge} />
            <rect x={on ? 40 : 24} y={20} width={16} height={16} rx={3} fill={on ? V.high : V.lead} />
          </>
        )}
      </g>

      {['A', 'C', 'B'].map((t, i) => (
        <text key={t} x={20 + i * 20} y={43} textAnchor="middle" className="part-label" fontSize={7}>
          {t}
        </text>
      ))}

      {l.pins.map((p) => (
        <PinDot
          key={p.n}
          n={p.n}
          x={p.x}
          y={p.y}
          value={engine.valueAt(comp.id, p.n)}
          hover={hoverPin === p.n}
          wireMode={wireMode}
        />
      ))}
    </g>
  );
};

const ClockShape = ({ comp, model, engine, hoverPin, wireMode, onProps }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const p = l.pins[0];
  const manual = comp.props.mode === 'manual';
  const level = engine.stateOf(comp.id).level ?? 0;
  return (
    <g>
      <ModuleFrame l={l} title="CLOCK" bar={V.barClock} rot={comp.rot} />
      <path
        d="M 12 52 h 9 v -16 h 11 v 16 h 11 v -16 h 11 v 16 h 9"
        fill="none"
        stroke={level === 1 ? V.high : V.lead}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <text x={l.w - 10} y={38} textAnchor="end" className="part-label" fontSize={10}>
        {manual ? 'MANUAL' : `${Number(comp.props.freq ?? 1).toFixed(1)} Hz`}
      </text>
      {manual && (
        <g
          style={{ cursor: 'pointer' }}
          onPointerDown={(e) => {
            stop(e);
            onProps({ level: comp.props.level ? 0 : 1 });
          }}
        >
          <rect x={l.w - 46} y={44} width={34} height={16} rx={8} fill={V.modSlot} stroke={V.modEdge} />
          <text x={l.w - 29} y={56} textAnchor="middle" fontSize={9} fill={V.modText}>
            {comp.props.level ? 'HI' : 'LO'}
          </text>
        </g>
      )}
      <line x1={l.w - 8} y1={p.y} x2={p.x} y2={p.y} stroke={V.lead} strokeWidth={2} />
      <PinDot
        n={1}
        x={p.x}
        y={p.y}
        value={engine.valueAt(comp.id, 1)}
        hover={hoverPin === 1}
        wireMode={wireMode}
      />
    </g>
  );
};

/** Segment rectangles inside the digit window (x 34..86, y 24..112). */
const SEG_RECTS: Record<string, [number, number, number, number]> = {
  a: [42, 28, 32, 5],
  b: [74, 34, 5, 26],
  c: [74, 70, 5, 26],
  d: [42, 98, 32, 5],
  e: [36, 70, 5, 26],
  f: [36, 34, 5, 26],
  g: [42, 62, 32, 5],
};

const Seg7Shape = ({ comp, model, engine, hoverPin, wireMode }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const segs: boolean[] = engine.stateOf(comp.id).segs ?? [];
  const color = (comp.props.color as string) ?? '#ff5f4d';
  const common = comp.props.common === 'cathode' ? 'CC' : 'CA';

  return (
    <g>
      <rect x={0} y={0} width={l.w} height={l.h} rx={7} fill={V.modBody} stroke={V.modEdge} strokeWidth={1.5} />
      <rect x={30} y={20} width={60} height={96} rx={5} fill={V.segBg} />
      {SEG_NAMES.slice(0, 7).map((s, i) => {
        const [x, y, w, h] = SEG_RECTS[s];
        return (
          <rect
            key={s}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={2}
            fill={segs[i] ? color : V.segOff}
            opacity={segs[i] ? 1 : 0.25}
            className={segs[i] ? 'led-glow' : ''}
            color={color}
          />
        );
      })}
      <circle cx={82} cy={101} r={3} fill={segs[7] ? color : V.segOff} opacity={segs[7] ? 1 : 0.25} />
      <text x={l.w / 2} y={126} textAnchor="middle" className="part-label" fontSize={7}>
        {common} 7-SEG
      </text>

      {l.pins.map((p, i) => {
        const left = p.side === 'L';
        return (
          <g key={p.n}>
            <line
              x1={p.x}
              y1={p.y}
              x2={left ? 8 : l.w - 8}
              y2={p.y}
              stroke={V.lead}
              strokeWidth={2}
            />
            <text
              x={left ? 10 : l.w - 10}
              y={p.y - 4}
              textAnchor={left ? 'start' : 'end'}
              className="part-label"
              fontSize={8}
            >
              {model.pins[i].name}
            </text>
            <PinDot
              n={p.n}
              x={p.x}
              y={p.y}
              value={engine.valueAt(comp.id, p.n)}
              hover={hoverPin === p.n}
              wireMode={wireMode}
            />
          </g>
        );
      })}
    </g>
  );
};

const ResistorShape = ({ comp, model, engine, hoverPin, wireMode }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const pull = model.type !== 'resistor';
  const up = model.type === 'pullup';

  if (!pull) {
    return (
      <g>
        <line x1={0} y1={16} x2={20} y2={16} stroke={V.leg} strokeWidth={2.5} strokeLinecap="round" />
        <line x1={60} y1={16} x2={80} y2={16} stroke={V.leg} strokeWidth={2.5} strokeLinecap="round" />
        <rect x={20} y={6} width={40} height={20} rx={6} fill="#c9a36a" stroke="#8a6b3a" />
        <rect x={26} y={6} width={4} height={20} fill="#6b4a21" />
        <rect x={34} y={6} width={4} height={20} fill="#c2410c" />
        <rect x={42} y={6} width={4} height={20} fill="#1f2937" />
        <text x={40} y={4} textAnchor="middle" className="part-label" fontSize={8}>
          {comp.props.ohms ?? 330}R
        </text>
        {l.pins.map((p) => (
          <PinDot
            key={p.n}
            n={p.n}
            x={p.x}
            y={p.y}
            value={engine.valueAt(comp.id, p.n)}
            hover={hoverPin === p.n}
            wireMode={wireMode}
          />
        ))}
      </g>
    );
  }

  const p = l.pins[0];
  const railY = up ? 6 : 50;
  const bodyY = up ? 14 : 20;
  return (
    <g>
      <line
        x1={30}
        y1={railY}
        x2={30}
        y2={up ? bodyY : bodyY + 22}
        stroke={up ? V.vcc : V.gnd}
        strokeWidth={2.5}
      />
      <line x1={18} y1={railY} x2={42} y2={railY} stroke={up ? V.vcc : V.gnd} strokeWidth={3.5} strokeLinecap="round" />
      <rect x={18} y={bodyY} width={24} height={22} rx={5} fill="#c9a36a" stroke="#8a6b3a" />
      <text x={30} y={bodyY + 15} textAnchor="middle" fontSize={8} fill="#3b2a13">
        10k
      </text>
      <line
        x1={30}
        y1={up ? bodyY + 22 : bodyY}
        x2={p.x}
        y2={p.y}
        stroke={V.leg}
        strokeWidth={2.5}
      />
      <PinDot
        n={1}
        x={p.x}
        y={p.y}
        value={engine.valueAt(comp.id, 1)}
        hover={hoverPin === 1}
        wireMode={wireMode}
      />
    </g>
  );
};

const ProbeShape = ({ comp, model, engine, hoverPin, wireMode }: ShapeProps) => {
  const l = layoutOf(model, comp);
  const v = engine.valueAt(comp.id, 1);
  return (
    <g>
      <rect
        x={14}
        y={4}
        width={l.w - 14}
        height={l.h - 8}
        rx={6}
        fill={V.modBody}
        stroke={V.modEdge}
        strokeWidth={1.5}
      />
      <line x1={0} y1={20} x2={14} y2={20} stroke={V.leg} strokeWidth={2.5} strokeLinecap="round" />
      <text
        x={(l.w + 14) / 2}
        y={26}
        textAnchor="middle"
        fontSize={15}
        fontFamily="ui-monospace, monospace"
        fill={levelColor(v)}
      >
        {levelText(v)}
      </text>
      <PinDot n={1} x={0} y={20} value={v} hover={hoverPin === 1} wireMode={wireMode} />
    </g>
  );
};

// ------------------------------------------------------------- breadboard

const BreadboardShape = memo(function BreadboardShape({ comp }: { comp: PlacedComponent }) {
  const cols = Array.from({ length: BB_COLS }, (_, c) => c);
  const rows = [0, 1, 2, 3, 4];
  const hole = (x: number, y: number, key: string) => (
    <rect
      key={key}
      x={x - 3.4}
      y={y - 3.4}
      width={6.8}
      height={6.8}
      rx={1.6}
      fill={V.boardHole}
      stroke={V.boardHoleEdge}
      strokeWidth={1}
    />
  );

  return (
    <g>
      <rect
        x={-6}
        y={-6}
        width={BB_W + 12}
        height={BB_H + 12}
        rx={9}
        fill={V.boardBody}
        stroke={V.boardEdge}
        strokeWidth={2}
      />

      {/* power rails */}
      {[
        { y: BB_ROWS.railTopPlus, c: V.boardPlus, s: '+' },
        { y: BB_ROWS.railTopMinus, c: V.boardMinus, s: '−' },
        { y: BB_ROWS.railBotPlus, c: V.boardPlus, s: '+' },
        { y: BB_ROWS.railBotMinus, c: V.boardMinus, s: '−' },
      ].map((rail, i) => (
        <g key={i}>
          <line
            x1={12}
            y1={rail.y}
            x2={BB_W - 12}
            y2={rail.y}
            stroke={rail.c}
            strokeWidth={1}
            opacity={0.45}
          />
          <text x={2} y={rail.y + 4} fontSize={11} fill={rail.c} fontWeight={700}>
            {rail.s}
          </text>
        </g>
      ))}

      {cols.map((c) => (
        <g key={`r${c}`}>
          {hole(holeX(c), BB_ROWS.railTopPlus, `tp${c}`)}
          {hole(holeX(c), BB_ROWS.railTopMinus, `tm${c}`)}
          {hole(holeX(c), BB_ROWS.railBotPlus, `bp${c}`)}
          {hole(holeX(c), BB_ROWS.railBotMinus, `bm${c}`)}
        </g>
      ))}

      {cols.map((c) =>
        rows.map((r) => (
          <g key={`t${c}-${r}`}>
            {hole(holeX(c), BB_ROWS.bankTop + r * 20, `a${c}${r}`)}
            {hole(holeX(c), BB_ROWS.bankBottom + r * 20, `b${c}${r}`)}
          </g>
        )),
      )}

      {/* centre channel */}
      <rect
        x={8}
        y={BB_ROWS.bankTop + 4 * 20 + 12}
        width={BB_W - 16}
        height={BB_ROWS.bankBottom - BB_ROWS.bankTop - 4 * 20 - 24}
        rx={3}
        fill={V.boardChannel}
      />
      <text
        x={BB_W / 2}
        y={BB_ROWS.bankTop + 4 * 20 + 32}
        textAnchor="middle"
        fontSize={9}
        fill={V.boardMark}
        letterSpacing="0.3em"
      >
        {comp.label ?? 'BREADBOARD'}
      </text>

      {/* column numbers and row letters */}
      {cols.map((c) =>
        (c + 1) % 5 === 0 || c === 0 ? (
          <text
            key={`n${c}`}
            x={holeX(c)}
            y={BB_ROWS.bankTop - 9}
            fontSize={8}
            fill={V.boardMark}
            textAnchor="middle"
          >
            {c + 1}
          </text>
        ) : null,
      )}
      {['A', 'B', 'C', 'D', 'E'].map((letter, r) => (
        <text
          key={letter}
          x={16}
          y={BB_ROWS.bankTop + r * 20 + 3}
          fontSize={8}
          fill={V.boardMark}
          textAnchor="end"
        >
          {letter}
        </text>
      ))}
      {['F', 'G', 'H', 'I', 'J'].map((letter, r) => (
        <text
          key={letter}
          x={16}
          y={BB_ROWS.bankBottom + r * 20 + 3}
          fontSize={8}
          fill={V.boardMark}
          textAnchor="end"
        >
          {letter}
        </text>
      ))}
    </g>
  );
});

/** Highlights live rails so a powered board is obvious at a glance. */
function BoardOverlay({ comp, engine }: { comp: PlacedComponent; engine: CircuitEngine }) {
  const marks: React.ReactNode[] = [];
  const railRows: [number, (c: number) => number][] = [
    [BB_ROWS.railTopPlus, BB.railTopPlus],
    [BB_ROWS.railTopMinus, BB.railTopMinus],
    [BB_ROWS.railBotPlus, BB.railBotPlus],
    [BB_ROWS.railBotMinus, BB.railBotMinus],
  ];
  for (const [y, fn] of railRows) {
    const v = engine.valueAt(comp.id, fn(0));
    if (v === 'X') continue;
    marks.push(
      <line
        key={`rail${y}`}
        x1={12}
        y1={y}
        x2={BB_W - 12}
        y2={y}
        stroke={levelColor(v)}
        strokeWidth={2.5}
        opacity={0.8}
      />,
    );
  }
  return <g pointerEvents="none">{marks}</g>;
}

// -------------------------------------------------------------- dispatcher

const SHAPES: Record<string, (p: ShapeProps) => JSX.Element> = {
  writer: WriterShape,
  reader: ReaderShape,
  vcc: RailShape,
  gnd: RailShape,
  led: LedShape,
  switch: SwitchShape,
  pushbutton: SwitchShape,
  clock: ClockShape,
  seg7: Seg7Shape,
  resistor: ResistorShape,
  pullup: ResistorShape,
  pulldown: ResistorShape,
  probe: ProbeShape,
};

export function ComponentShape(props: ShapeProps) {
  const { comp, model, selected, engine } = props;
  const l = layoutOf(model, comp);
  const isBoard = model.category === 'board';

  const body = isBoard ? (
    <>
      <BreadboardShape comp={comp} />
      <BoardOverlay comp={comp} engine={engine} />
    </>
  ) : model.pkg === 'module' ? (
    (SHAPES[model.type] ?? DipShape)(props)
  ) : (
    <DipShape {...props} />
  );

  return (
    <g transform={transformOf(comp, l)} data-comp={comp.id}>
      {body}
      {selected && (
        <rect className="selected-outline" x={-5} y={-5} width={l.w + 10} height={l.h + 10} rx={6} />
      )}
    </g>
  );
}
