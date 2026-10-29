# Moments, not zones

## What is measured, and what was made up

Measured — from the map and stream dumps, the engine code, and race traces:

- A node plays one bar-long slice; at the end of it the engine takes the first branch whose range
  contains the **control value** (0-127).
- The value is written by the director as `127 * updates / T` with `T` = 800, 1000 or 1200 updates
  (about 13, 17 or 20 s), and is reset by rider events carrying a 0-1 strength classed at 0.25 and
  0.65.
- Events: `0` start, `36` load, `10` finish, `N` on entering a course music trigger and `N+1` on
  leaving it. A handful (`0x0B`, `0x0D`, `0x0E-0x12`, `0x2A`) only pass through under extra
  conditions.
- An event carries a list of actions: go to node, store register, return, wait ms, fade to level,
  stop.
- A song has a second track: a loop bank of one-beat sounds with nodes of its own.
- One Snow Jam run fired 1 (~90 s), 2 (~140 s), 9 (~220 s) and 10 at the finish.

Made up — presented as fact in this tool until now, and wrong:

- that a trigger is a named kind of terrain — a rail park, a powder bowl, a tunnel — and that each
  wants a particular treatment;
- that bars marked as "side material" are the drop that arrives on a ten-trick combo;
- any sentence about what a rider sees at the moment an event fires.

The mechanism was measured. The *meaning* was invented. That is the distinction this document exists
to keep.

## The model: moments and cues

The author answers two questions and nothing else: what plays while riding, and what happens at each
moment.

**Groove.** Eight to sixteen bars of the track, cut on its own grid. This is the body of the song.

**Ladder.** Three renders of the groove — thin, mid, full — made by processing, not by asking for
three mixes: lead muted and low-passed, as-is, and with extra percussion plus an octave layer. The
0-127 value climbs this ladder, so the song gains intensity as the value does. One mix in, three
levels out.

**Cues.** Short one-shots, one per moment: takeoff, air, landing, bail, finish, start.

**Wiring.** Each moment's measured signal fires its cue. Which signals exist today:

| moment | signal | status |
|---|---|---|
| start | event 0 | measured |
| flow, low | value 0-50 | measured |
| flow, high | value 100-127 | measured |
| impact | value reset, strength 0.25 / 0.65 | in code; which rider events cause it is inferred |
| finish | event 10 | measured |
| airborne | none known | **not measured** |
| big air, trick landed | none known | **not measured** |

**The cue bus.** A cue has to land when the moment happens, not at the next bar. The engine's second
track gives exactly that: the map can jump track 2 to a cue node and let track 1 keep playing, which
is what the shipped maps do when they move the loop bank around. So cues are one-shots on track 2
while the groove keeps running on track 1. Shipped songs use that bank for menus; nothing says it
cannot carry a bail hit.

That is the novel part: no sections, no map, no event numbers in the author's way. Groove, ladder,
cues — and the generator writes the node and event tables.

## What must be measured before it can be built

The airborne moments have no known signal. Building them now would repeat the mistake above. The
experiment:

1. Instrument the port's music path: log every event number with a timestamp, every value write, every
   reset with its strength class, and every map jump.
2. Ride a scripted run on a known course: hold a line, jump at known times, land badly on purpose,
   cross the finish.
3. Correlate the log with the ride. The output is the table above, with latencies.

Every row that stays empty stays out of the creator, and the tool says so rather than dressing a
guess as a description.

## Consequence for the tool as it stands

- The invented terrain examples are gone from the page and the docs.
- "Course zone" is "course trigger" — the word the engine research uses — and keeps the measured
  `N` / `N+1` behaviour.
- Section types are described as rungs of the value ladder, not as kinds of terrain.
- A Moments panel lists the seven moments with the status of their signal, so the plan is visible:
  the flow ladder, impacts and the finish are answerable today; airborne is not.
