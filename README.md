# Digital Electronics Virtual Practical Lab

A browser-based digital electronics laboratory. Students take real 74-series IC
packages out of a parts bin, drop them on a bench or a breadboard, wire VCC,
GND, inputs and outputs by hand, and run the circuit — the same sequence they
would follow at a physical trainer kit.

There are no pre-made "logic gate" blocks. Every part is a package with the pin
numbers, pin functions and power pins from its datasheet, and the simulator
reads and drives exactly those pins.

```
Bench:  parts library │ workspace / breadboard │ inspector, checks, truth table
                      └──── digital writer · digital reader · clock · analyzer
```

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5180.

| command | what it does |
| --- | --- |
| `npm run dev` | dev server with hot reload |
| `npm run build` | type-check and produce `dist/` |
| `npm run preview` | serve the production build |
| `npm test` | run the simulation test suite (101 tests) |
| `npm run typecheck` | TypeScript only |

The app is fully static once built: `dist/` can be dropped on any web host.
Circuits are stored in the browser's `localStorage`, so no backend is needed.

## What is in the parts bin

**Gate packages** — 7400 (quad NAND), 7402 (quad NOR), 7404 (hex inverter),
7408 (quad AND), 7432 (quad OR), 7486 (quad XOR), 7410 and 7411 and 7427
(triple 3-input), 7420 and 7421 and 7413 (dual 4-input).

**MSI** — 74138 (3-to-8 decoder), 74139 (dual 2-to-4 decoder), 74148 (8-to-3
priority encoder), 74151 (8-to-1 mux), 74153 (dual 4-to-1 mux), 74157 (quad
2-to-1 mux), 7483 (4-bit adder), 7447 (BCD to seven-segment driver).

**Sequential** — 7474 (dual D), 7476 (dual JK), 74175 (quad D register), 74173
(4-bit register with 3-state outputs), 74161 and 74163 (synchronous counters),
74164 (SIPO shift register), 74165 (PISO shift register), 7490 (decade
counter), 7493 (4-bit ripple counter).

**Bench modules** — Digital Writer (D0–D7), Digital Reader (R8–R15), VCC, GND,
LED, SPDT switch, push button, clock generator, seven-segment display, series
resistor, pull-up and pull-down resistors, logic probe, breadboard.

Each package carries its real pinout, a datasheet-style pin table, a truth
table and bench notes ("power is **not** on the corner pins of a 7476").

## How the simulation works

`src/sim/` is plain TypeScript with no React or DOM dependency, so the engine
can be tested on its own — and it is, against every IC's truth table.

**Three-valued logic.** A node is `0`, `1` or `X`. `X` means *unknown*, which
is what you get from a floating input, an unpowered package or two outputs
fighting. The engine refuses to guess: an AND gate with one input open gives
`X`, unless the other input is a `0`, in which case the answer is `0` whatever
the open pin does — exactly like the real gate. Three-state outputs drive `Z`,
which simply contributes nothing to the node.

**Nets, not wires.** `netlist.ts` merges pins into nodes through three routes:
a wire the student drew, a part's internal bonds (breadboard strips, the two
ends of a resistor), and *contact by position* — a leg sitting in a breadboard
hole. That last one is why a breadboard behaves like a breadboard.

**Delta-step settling.** Every component is evaluated once per step from the
node values left by the previous step, and the loop repeats until nothing
changes. Two useful things fall out of that:

- cross-coupled gates genuinely latch, because each output holds its previous
  value while the loop runs — build an SR latch from two NAND gates and it
  remembers;
- a circuit that cannot settle (a ring of inverters, a latch driven into its
  forbidden state) is detected as *oscillating* after 150 steps instead of
  hanging the browser.

Clocked parts detect an edge by comparing the clock against the level they saw
on the previous step, so one real edge fires exactly one trigger and a ripple
counter propagates naturally, one stage per step.

**Power is real.** A package whose VCC pin is not at +5 V and GND pin not at
0 V produces nothing at all. Getting a circuit to work starts, as it should,
with the supply wires.

## Validation

The checks panel never just says "ERROR". It names the pin, says what is wrong
in the language of the lab, and has a **Why?** button with the underlying idea:

- *"Pin 7 (GND) of U1 (7408) must be connected to ground."*
- *"Input pin 2 (1B) of U1 is floating."* → why: nothing drives it, so its
  level is unknown, not 0; on real TTL an open input floats to a noisy HIGH.
- *"Two outputs are wired together: pin 3 of U1 and pin 6 of U1."*
- *"Short circuit: VCC is wired directly to GND."*
- *"✓ VCC connected correctly on U1 (7408) (pin 14)."*

Floating inputs can be switched between the honest **undefined** mode and a
simplified **pull-down** mode for early lessons.

## Experiments

Twenty practicals, each with an objective, the theory, the parts list, the
circuit requirements, the pin configuration, a numbered procedure, the truth
table and the expected result:

1. AND, OR, NOT · 2. NAND, NOR · 3. XOR, XNOR · 4. Gates from NAND only ·
5. Gates from NOR only · 6. Half adder · 7. Full adder · 8. Half subtractor ·
9. Full subtractor · 10. 4-bit binary adder · 11. Multiplexer ·
12. Demultiplexer · 13. Encoder · 14. Decoder · 15. SR flip-flop ·
16. JK flip-flop · 17. D flip-flop · 18. T flip-flop · 19. Counters ·
20. Shift registers

**Start experiment** puts the required ICs on the bench *unwired* — the wiring
is the exercise. **Check my circuit** then drives the writer channels the
experiment names, settles the circuit the student actually built, reads the
reader channels back and reports row by row what was expected and what was
measured. It never inspects the wiring, so any correct circuit passes.

## Tools

- **Truth table generator** — sweeps every combination of the connected writer
  channels through the real circuit and tabulates the readers. Copies as CSV.
- **Logic analyzer** — probe any pin and watch its level over time; the only
  sane way to see a counter or a shift register work.
- **Clock generator** — 0.2–10 Hz, adjustable duty cycle, plus a manual mode
  with Toggle and Pulse for stepping a sequential circuit one edge at a time.
- **Save / load** — save, rename, duplicate, delete and export circuits as
  JSON; the bench itself is autosaved, so a refresh does not lose work.

## Light and dark bench

The bench is **light by default**: a cool white sheet, black IC packages,
silver legs and a warm cream breadboard - what the hardware actually looks like
under lab lights. The board is deliberately warmer and darker than the sheet,
because a cream board on a white bench with a pale outline is a board you
cannot see. The moon button in the toolbar switches to a dark bench and the
choice is remembered.

Both palettes are one set of CSS custom properties, so the chrome and the SVG
bench flip together; nothing re-renders and no colour is hard-coded in a
component.

## On a phone or tablet

The lab is usable on a phone, with the workspace prioritised:

- the toolbar becomes a single strip you swipe sideways, with Run, Reset and
  the theme toggle pinned where they cannot scroll away;
- Parts, Experiments and the Inspector slide in as full-height drawers, and the
  Parts drawer closes itself once a part is on the bench;
- one finger drags the bench around and two fingers pinch it bigger; the whole
  bench is framed on load, so pinch in on the part of the board you are using;
- turn the board upright and it runs down the screen with the panels either
  side of it, which is the layout a portrait phone actually wants: tap the
  board to select it, then Rotate, which appears in the toolbar next to Run
  whenever something is selected;
- the inspector stays shut on anything narrower than a wide desktop, so the
  bench gets the room instead;
- pin targets and buttons grow on touch screens, and nothing pinches or
  double-taps the page itself;
- wiring is a mode - tap **Wire**, then tap a pin and tap another - with a
  Cancel button in place of the Esc key;
- a wire is decided when the finger *lifts*, not when it lands, so pinching to
  zoom in on the pin you are aiming at never wires whatever the first finger
  happened to touch. A half-drawn wire survives the pinch, which is the whole
  point of zooming in mid-wire;
- the bench I/O panel starts collapsed on a phone and stacks the writer, reader
  and clock into one scrolling column when you open it.

## Breadboard mode

Turn on **Board** and drop an IC near the centre channel: it straddles the
channel with a leg in every hole, as it would on a real board. Each column of
five holes is one node, the four long rails are the power buses, and the rails
are dead until VCC and GND are wired to them. Wires attach to holes exactly as
they attach to pins.

The board is a full-size one: **60 columns, 840 tie points**, at the same hole
pitch and the same proportions as the board on a lab desk. That is eight
14-pin packages in a row with a spare column between each for jumpers.

**The board turns.** Rotate it and a long board stands upright, which is the
only way a 60-column board is any use on a phone. Seating works from the holes'
own positions rather than from column arithmetic, so a package still lands with
every leg in a hole whichever of the four ways round the board is. Turning a
board carries everything plugged into it round with it - the legs stay in the
same holes, so a circuit half-built survives - and the two trainer panels move
to stay beside it instead of being left spread out where the flat board had
them.

Parts really do fit. Every pin of every part sits on the 0.1 inch hole pitch,
and a part is only seated where **all** of its legs land in holes - so a
seven-segment display cannot end up hanging half off a bank, and a second IC
dropped on top of the first slides sideways to the nearest free columns,
leaving a spare column between them for jumpers. The two trainer panels
(Digital Writer and Digital Reader) are taller than any bank, so they stand
beside the board and you run wires across, exactly like the real kit. All of
this is covered by tests.

The centre channel is drawn wider than a real 0.3 inch DIP gap so the package
body and its pin names stay readable at normal zoom.

## Wiring is a mode

Pick the **Wire** tool, then tap a pin and tap another. Outside wire mode a pin
is just part of the package: the breadboard is 840 pins and nothing else, so if
every touch on one started a wire there would be no way to move the view or
pick anything up. Select and Wire stay pinned in the toolbar on a phone, where
the rest of the strip scrolls away. Leaving wire mode abandons a half-drawn
wire rather than leaving it armed.

## Wires route themselves

A wire is not a straight line from pin to pin. Each one is routed around the
packages by an A* search on a coarse grid, the same way you would push a
jumper flat across a board rather than lay it over a chip:

- every package body is an obstacle, and a wire leaves a pin in the direction
  the pin points rather than turning against it;
- corners cost extra, so runs come out long and straight instead of stepped;
- a wire that would share a corridor with one already there pays a small
  penalty, so wires fan out into separate lanes;
- short wires are laid first - a short hop deserves the straight line and a
  long one has room to go round;
- then every wire is **pulled up and laid again**, because the first one down
  was routed before it knew about any of the others;
- the breadboard is not an obstacle: jumpers lie on it, as they should.

The result does not depend on how you drew it. Four writer channels wired to
four holes come out as four parallel lanes with two corners each and no
crossings, whichever order you wire them in.

**Tidy wires** in the toolbar turns the routing off if you would rather place
every corner by hand - and corners are only yours to place with it off, so a
stray tap cannot bend a wire the lab is routing for you. Routing is pure
geometry in `src/sim/route.ts`, with no React in it, and it is unit tested.

Laying 24 wires on a busy bench, both passes, takes about 80 ms - and it only
runs when the drawing changes, never when a switch is flicked or the
simulation ticks.

## Zoom belongs to the bench

Ctrl+wheel, pinch and Ctrl+plus scale the **workspace**, never the page - so
the toolbar and the bench I/O strip stay where they are and only the circuit
grows. `+` / `−` / `Fit` are in the toolbar, and the zoom runs from 25% to 300%.

Panning: the wheel, Alt+drag or the Pan tool with a mouse. On a touch screen
one finger drags the sheet - including when it lands on the board, because the
board covers the workspace and there would otherwise be no way out - and two
fingers pinch and drag together, so whatever you grabbed stays under them.

## Project layout

```
src/
  sim/                  the simulator - no React in here
    types.ts            Logic values, pins, components, circuits
    logic.ts            three-valued AND/OR/NOT/XOR
    ics/gates.ts        74-series gate packages
    ics/combinational.ts decoders, encoders, muxes, adder, 7447
    ics/sequential.ts   flip-flops, counters, shift registers
    devices.ts          writer, reader, power, LED, switches, clock, display
    breadboard.ts       holes, strips and rails
    geometry.ts         where every pin physically sits
    netlist.ts          pins -> nodes (wires, internal bonds, hole contact)
    route.ts            orthogonal wire routing around the packages
    engine.ts           delta-step settling, edges, oscillation detection
    validate.ts         the educational checks
    truthtable.ts       sweep the real circuit
    verify.ts           experiment checking
    storage.ts          localStorage save/load/export
    registry.ts         the parts bin
  data/experiments.ts   the twenty practicals
  store/lab.tsx         circuit state, undo/redo, simulation loop
  ui/                   toolbar, library, workspace, inspector, bench, panels
test/                   101 tests over the engine, the library, placement, routing
```

Adding an IC means adding one entry to a file in `src/sim/ics/` — pins,
description and an `evaluate` function. Nothing else in the app changes.

## Tests

```bash
npm test
```

- every gate package is driven through **all** of its input combinations, on
  **every** gate in the package, and compared against the operator
- decoders, encoders, multiplexers, the adder and the 7447 segment patterns
- flip-flops: edge polarity, asynchronous preset and clear, the forbidden
  state, and that Q does not follow D between edges
- counters: 7493 counting 0–15 with QA chained to CKB, 7490 rolling over at 9,
  74161 loading and 74163's synchronous clear
- shift registers, the 3-state register releasing the bus
- wire propagation, fan-out, floating inputs, pull-ups losing to real outputs,
  missing and reversed power, output clashes, supply shorts, the NAND latch,
  ring oscillation, breadboard strips and legs making contact in holes
- the experiment checker: a correctly built half adder, full adder, SR latch,
  D flip-flop, counter, shift register and demultiplexer pass, and
  deliberately miswired versions fail
- the board itself: 60 columns and 840 tie points; a package seats with every
  leg in a hole with the board at each of the four rotations; a turned board is
  wired up through its strips exactly like a flat one; and turning a board
  carries a seated package round with it, still powered afterwards
- breadboard fit: every DIP and every seatable module lands with all of its
  legs in holes, a second DIP shifts clear of the first, and a part dropped
  away from the board is left where it was put
- wire routing: one corner when the way is clear, around a package when it is
  not, through a gap between two, a second wire nudged into its own lane, a
  student corner kept, a walled-in pin still given a usable path, and a wire
  between two real 74-series packages clearing both bodies

## Modelling notes

Honest about what is and is not simulated:

- **Timing is logical, not physical.** Steps are unit delays, not nanoseconds.
  Propagation delay, setup and hold times and race conditions from unequal gate
  delays are not modelled; ripple counters do settle one stage per step, which
  shows the staircase but not its real duration.
- **The 7476 is modelled as negative-edge triggered** (the 74LS76). The
  original 7476 is a pulse-triggered master-slave device.
- **The 74173's clear** is clocked in on the rising edge in this model.
- **The 7447's pin 4** is treated as the blanking input only; its
  ripple-blanking output behaviour is not simulated.
- **No analogue behaviour**: no fan-out limits, no current, no contact bounce,
  and a Schmitt-trigger input (7413) behaves as a plain gate.
- **Power-on state** of flip-flops, counters and registers is LOW here. Real
  devices come up unpredictably, which is why every lab sheet says to clear
  them first — and the clear pins behave like the real ones.
```
