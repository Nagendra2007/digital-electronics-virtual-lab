/**
 * The non-IC parts of the trainer kit: the digital writer and reader modules,
 * power sources, switches, LEDs, the clock generator, a seven-segment display
 * and passive parts.
 *
 * These are modelled with the same `ComponentModel` interface as the ICs, so the
 * engine does not care which is which.
 */
import type { ComponentModel, NetValue, PinDef } from './types';

const P = (
  n: number,
  name: string,
  kind: PinDef['kind'],
  fn: string,
  extra: Partial<PinDef> = {},
): PinDef => ({ n, name, kind, fn, ...extra });

// ---------------------------------------------------------------------------
// Digital Writer - eight switched logic sources, D0..D7
// ---------------------------------------------------------------------------
export const WRITER_CHANNELS = 8;

const writer: ComponentModel = {
  type: 'writer',
  label: 'DIGITAL WRITER',
  name: 'Digital Writer D0-D7',
  category: 'io',
  pkg: 'module',
  needsPower: false,
  boardMountable: false,
  description:
    'Eight independent logic sources, exactly like the data switches on a lab trainer kit. Each channel drives a solid HIGH or LOW onto whatever it is wired to.',
  notes: [
    'Toggle a channel from the bench panel at the bottom of the screen, or click its switch on the module itself.',
    'A channel drives its pin all the time - it is a real source, so do not wire two of them (or a gate output) onto the same node.',
  ],
  keywords: ['input', 'switch', 'data switch', 'source', 'd0', 'logic input'],
  pins: Array.from({ length: WRITER_CHANNELS }, (_, i) =>
    P(i + 1, `D${i}`, 'output', `Digital writer channel ${i}`),
  ),
  defaultProps: { values: Array(WRITER_CHANNELS).fill(0) },
  evaluate(ctx) {
    const values = (ctx.props.values ?? []) as number[];
    for (let i = 0; i < WRITER_CHANNELS; i++) {
      ctx.write(i + 1, (values[i] ? 1 : 0) as 0 | 1);
    }
  },
};
// ---------------------------------------------------------------------------
// Digital Reader - eight indicator channels, R8..R15
// ---------------------------------------------------------------------------
export const READER_CHANNELS = 8;
export const READER_FIRST = 8;

const reader: ComponentModel = {
  type: 'reader',
  label: 'DIGITAL READER',
  name: 'Digital Reader R8-R15',
  category: 'io',
  pkg: 'module',
  needsPower: false,
  boardMountable: false,
  description:
    'Eight indicator channels. Wire a circuit output to a channel and it shows the level: 1, 0, or a floating warning when nothing is driving the node.',
  notes: [
    'Reader channels are high-impedance inputs - connecting one never changes the circuit.',
    'A channel showing X means the node is floating or undefined, not that it is LOW.',
  ],
  keywords: ['output', 'indicator', 'lamp', 'r8', 'logic output', 'probe'],
  pins: Array.from({ length: READER_CHANNELS }, (_, i) =>
    P(i + 1, `R${READER_FIRST + i}`, 'input', `Digital reader channel ${READER_FIRST + i}`),
  ),
  initState: () => ({ values: Array(READER_CHANNELS).fill('X') as NetValue[] }),
  evaluate(ctx) {
    const values: NetValue[] = [];
    for (let i = 0; i < READER_CHANNELS; i++) values.push(ctx.read(i + 1));
    ctx.state.values = values;
  },
};

// ---------------------------------------------------------------------------
// Power sources
// ---------------------------------------------------------------------------
const vcc: ComponentModel = {
  type: 'vcc',
  label: 'VCC',
  name: '+5 V supply rail',
  category: 'source',
  pkg: 'module',
  needsPower: false,
  description:
    'The positive supply. Every TTL package needs it on its VCC pin, and it is also the source of a hard logic 1 for tying unused inputs HIGH.',
  notes: [
    'Connect this to the VCC pin of every IC in your circuit - usually pin 14 on a 14-pin package and pin 16 on a 16-pin one, but check each datasheet.',
    'Wiring VCC to GND, or to a gate output, is a short circuit and the validator will stop you.',
  ],
  keywords: ['power', '+5v', 'supply', 'high', 'logic 1'],
  pins: [P(1, 'VCC', 'output', '+5 V, a permanent logic HIGH')],
  evaluate(ctx) {
    ctx.write(1, 1);
  },
};

const gnd: ComponentModel = {
  type: 'gnd',
  label: 'GND',
  name: 'Ground / 0 V rail',
  category: 'source',
  pkg: 'module',
  needsPower: false,
  description:
    'The supply return and the reference for every logic level in the circuit. Also the source of a hard logic 0.',
  notes: [
    'Connect this to the GND pin of every IC. Without it the package has no return path and cannot work.',
    'Tie unused gate inputs to GND (or VCC) rather than leaving them floating.',
  ],
  keywords: ['ground', '0v', 'earth', 'low', 'logic 0', 'reference'],
  pins: [P(1, 'GND', 'output', '0 V, a permanent logic LOW')],
  evaluate(ctx) {
    ctx.write(1, 0);
  },
};

// ---------------------------------------------------------------------------
// LED
// ---------------------------------------------------------------------------
const led: ComponentModel = {
  type: 'led',
  label: 'LED',
  name: 'Indicator LED',
  category: 'io',
  pkg: 'module',
  needsPower: false,
  description:
    'A light emitting diode. It lights when the anode is HIGH and the cathode is LOW - so it needs BOTH of its legs wired, just like on a real board.',
  notes: [
    'Anode (the long leg, A) goes to the signal; cathode (K) goes to GND.',
    'On real hardware put a series resistor - typically 330 ohm - in the cathode leg.',
    'The LED is a load, not a source: it never drives the node it is connected to.',
  ],
  keywords: ['led', 'lamp', 'indicator', 'light', 'diode'],
  pins: [
    P(1, 'A', 'input', 'Anode - connect to the signal'),
    P(2, 'K', 'input', 'Cathode - connect to ground'),
  ],
  defaultProps: { color: '#ef4444' },
  initState: () => ({ on: false, note: '' }),
  evaluate(ctx) {
    const a = ctx.read(1);
    const k = ctx.read(2);
    ctx.state.on = a === 1 && k === 0;
    ctx.state.note =
      a === 'X' || k === 'X'
        ? 'One leg of the LED is floating'
        : a === 1 && k === 1
          ? 'Both legs HIGH - no voltage across the LED'
          : '';
  },
};

// ---------------------------------------------------------------------------
// Switches
// ---------------------------------------------------------------------------
const toggleSwitch: ComponentModel = {
  type: 'switch',
  label: 'SW',
  name: 'SPDT toggle switch',
  category: 'io',
  pkg: 'module',
  needsPower: false,
  description:
    'A single-pole double-throw switch. The common terminal is connected to A or to B depending on the lever. Wire A to VCC and B to GND and you have a real logic level source you can toggle.',
  notes: [
    'The COM pin passes through whatever is on the selected terminal - if that terminal is not wired, COM floats.',
    'This is how real trainer kits make their logic inputs: a switch between +5 V and 0 V.',
  ],
  keywords: ['switch', 'spdt', 'toggle', 'input'],
  pins: [
    P(1, 'A', 'input', 'Throw A - usually wired to VCC'),
    P(2, 'COM', 'output', 'Common terminal - the switched output'),
    P(3, 'B', 'input', 'Throw B - usually wired to GND'),
  ],
  defaultProps: { pos: 'b' },
  evaluate(ctx) {
    ctx.write(2, ctx.read(ctx.props.pos === 'a' ? 1 : 3));
  },
};

const pushButton: ComponentModel = {
  type: 'pushbutton',
  label: 'BTN',
  name: 'Momentary push button',
  category: 'io',
  pkg: 'module',
  needsPower: false,
  description:
    'A push-to-make button. While it is held, COM follows A; when released it falls back to B. Useful as a manual clock or a reset pulse.',
  notes: [
    'Hold the button on the module (or on the bench panel) to make the contact.',
    'Wire A to VCC and B to GND to get a clean HIGH pulse on each press.',
    'Real buttons bounce for a few milliseconds; this one does not.',
  ],
  keywords: ['button', 'momentary', 'pulse', 'manual clock', 'reset'],
  pins: [
    P(1, 'A', 'input', 'Contact made while pressed'),
    P(2, 'COM', 'output', 'Common terminal - the switched output'),
    P(3, 'B', 'input', 'Contact made while released'),
  ],
  defaultProps: { pressed: false },
  evaluate(ctx) {
    ctx.write(2, ctx.read(ctx.props.pressed ? 1 : 3));
  },
};

// ---------------------------------------------------------------------------
// Clock generator
// ---------------------------------------------------------------------------
const clock: ComponentModel = {
  type: 'clock',
  label: 'CLK',
  name: 'Clock generator',
  category: 'source',
  pkg: 'module',
  needsPower: false,
  description:
    'A square wave source with adjustable frequency and duty cycle, plus a manual mode for stepping a sequential circuit one edge at a time.',
  notes: [
    'In AUTO mode the output runs at the set frequency while the simulation is running.',
    'In MANUAL mode the output holds its level until you press Pulse or Toggle - the only sane way to watch a counter advance.',
    'Frequencies above about 10 Hz are faster than the display refresh; use the logic analyzer to see them.',
  ],
  keywords: ['clock', 'oscillator', 'square wave', 'pulse', 'timing', 'frequency'],
  pins: [P(1, 'OUT', 'output', 'Clock output')],
  defaultProps: { freq: 1, duty: 50, running: true, mode: 'auto', level: 0 },
  initState: () => ({ level: 0 as NetValue, edges: 0 }),
  evaluate(ctx) {
    let level: NetValue;
    if (ctx.props.mode === 'manual') {
      level = (ctx.props.level ? 1 : 0) as 0 | 1;
    } else if (!ctx.props.running) {
      level = (ctx.props.level ? 1 : 0) as 0 | 1;
    } else {
      const freq = Math.max(0.05, Number(ctx.props.freq) || 1);
      const duty = Math.min(95, Math.max(5, Number(ctx.props.duty) || 50));
      const period = 1000 / freq;
      const phase = (ctx.time % period) / period;
      level = phase < duty / 100 ? 1 : 0;
    }
    if (level !== ctx.state.level) ctx.state.edges = (ctx.state.edges ?? 0) + 1;
    ctx.state.level = level;
    ctx.write(1, level);
  },
};

// ---------------------------------------------------------------------------
// Seven-segment display
// ---------------------------------------------------------------------------
export const SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];

const seg7: ComponentModel = {
  type: 'seg7',
  label: '7-SEG',
  name: 'Seven-segment display',
  category: 'display',
  pkg: 'module',
  needsPower: false,
  description:
    'A single seven-segment digit with a decimal point. Choose common anode (drive segments LOW, as the 7447 does) or common cathode (drive segments HIGH).',
  notes: [
    'Common anode: wire COM to VCC; a segment lights when its pin is driven LOW. This is what you use with a 7447.',
    'Common cathode: wire COM to GND; a segment lights when its pin is driven HIGH.',
    'If COM is not wired the display cannot light - the validator will say so.',
  ],
  keywords: ['display', 'seven segment', '7 segment', 'digit', 'numeric'],
  pins: [
    ...SEG_NAMES.map((s, i) => P(i + 1, s, 'input', `Segment ${s} drive`)),
    P(9, 'COM', 'input', 'Common pin: to VCC (common anode) or GND (common cathode)'),
  ],
  defaultProps: { common: 'anode', color: '#ff5f4d' },
  initState: () => ({ segs: [false, false, false, false, false, false, false, false], note: '' }),
  evaluate(ctx) {
    const com = ctx.read(9);
    const anode = ctx.props.common !== 'cathode';
    const want: NetValue = anode ? 0 : 1;
    const comNeeds: NetValue = anode ? 1 : 0;
    const powered = com === comNeeds;
    const segs = SEG_NAMES.map((_, i) => powered && ctx.read(i + 1) === want);
    ctx.state.segs = segs;
    ctx.state.note = powered
      ? ''
      : com === 'X'
        ? 'COM pin is floating - wire it to ' + (anode ? 'VCC' : 'GND')
        : 'COM pin is at the wrong level for a common-' + (anode ? 'anode' : 'cathode') + ' display';
  },
};

// ---------------------------------------------------------------------------
// Passives
// ---------------------------------------------------------------------------
const resistor: ComponentModel = {
  type: 'resistor',
  label: 'R',
  name: 'Series resistor',
  category: 'passive',
  pkg: 'module',
  needsPower: false,
  description:
    'A current-limiting resistor, the kind you put in series with an LED. In a digital simulation the two ends are logically the same node.',
  notes: [
    'Logic levels pass straight through: this part exists so your LED circuits look and wire like the real thing.',
    'Use the pull-up or pull-down resistor instead if you want to hold a floating input at a defined level.',
  ],
  keywords: ['resistor', 'series', '330', 'current limit', 'passive'],
  pins: [
    P(1, '1', 'input', 'Terminal 1'),
    P(2, '2', 'input', 'Terminal 2'),
  ],
  defaultProps: { ohms: 330 },
  internalBonds: () => [[1, 2]],
  evaluate() {
    /* purely passive: the netlist bonds its two terminals together */
  },
};

const pullResistor = (kind: 'pullup' | 'pulldown'): ComponentModel => ({
  type: kind,
  label: kind === 'pullup' ? 'PULL-UP' : 'PULL-DOWN',
  name: kind === 'pullup' ? 'Pull-up resistor (10k to +5 V)' : 'Pull-down resistor (10k to 0 V)',
  category: 'passive',
  pkg: 'module',
  needsPower: false,
  description:
    kind === 'pullup'
      ? 'Holds a node at a defined HIGH unless something actively drives it LOW. This is the proper cure for a floating input.'
      : 'Holds a node at a defined LOW unless something actively drives it HIGH.',
  notes: [
    'This is a WEAK source: any real output on the same node wins, and the node only takes the resistor level when nothing else is driving.',
    'Wire it to an unused gate input and the floating-input warning goes away for the right reason.',
  ],
  keywords: ['pull up', 'pull down', 'resistor', 'floating', '10k', 'bias'],
  pins: [P(1, kind === 'pullup' ? 'PU' : 'PD', 'output', 'Weakly holds the node ' + (kind === 'pullup' ? 'HIGH' : 'LOW'))],
  weak: true,
  evaluate(ctx) {
    ctx.write(1, kind === 'pullup' ? 1 : 0);
  },
});

// ---------------------------------------------------------------------------
// Logic probe - a single-channel level indicator you can clip anywhere
// ---------------------------------------------------------------------------
const probe: ComponentModel = {
  type: 'probe',
  label: 'PROBE',
  name: 'Logic probe',
  category: 'io',
  pkg: 'module',
  needsPower: false,
  description:
    'A one-pin logic probe. Clip it anywhere in the circuit to read the level at that node without disturbing it.',
  notes: ['The probe never drives the node it touches.'],
  keywords: ['probe', 'test', 'measure', 'logic level'],
  pins: [P(1, 'TIP', 'input', 'Probe tip')],
  initState: () => ({ value: 'X' as NetValue }),
  evaluate(ctx) {
    ctx.state.value = ctx.read(1);
  },
};

export const DEVICES: ComponentModel[] = [
  writer,
  reader,
  vcc,
  gnd,
  led,
  toggleSwitch,
  pushButton,
  clock,
  seg7,
  resistor,
  pullResistor('pullup'),
  pullResistor('pulldown'),
  probe,
];
