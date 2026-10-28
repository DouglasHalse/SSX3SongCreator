# Song creator

A page that turns an audio file into an SSX 3 song arrangement: measures cut on
the beat grid, side material for the top of the control ramp, course-zone
sections, a finish section, and a preview that follows the game's director.

Open `index.html` in a browser. No server, no build step, no dependencies —
the audio never leaves the page.

## Using it

1. **Load audio** (WAV, MP3, OGG, FLAC — whatever the browser decodes) or press
   **Demo loop** to work without a file.
2. Set **BPM** to the audio's tempo, **Beats/measure** (4 unless the song is in
   something else) and **Offset** to move the cut to the first downbeat.
3. Click a measure to mark it as **side material**: it is heard only at the top
   of the control value, as the game's own songs do. Click again to clear it.
4. Drag across measures, then:
   - **Zone from selection** — that section becomes a course music zone: the
     game enters it by event *N* and leaves it by *N+1*, and the song returns to
     where it was (a call and a return, as on the console).
   - **Finish from selection** — from there the song plays once and ends.
5. **Play** runs the arrangement through the director model: the control value
   ramps 0-127 over the chosen time (13, 17 or 20 s — the three the game uses),
   every measure end takes a branch, and the event buttons jump: `load` (36),
   `finish` (10), `fade out` (19), and each zone's enter/leave pair.
   "demo sequence" fires a zone enter, its leave, the finish and the fade on a
   timer, so you can hear the whole flow hands-off.
6. **Export song.json** — the arrangement plus the map it produced; **Export
   map** — the same map as the text dump that `tools/ssx3_music.py` prints for a
   shipped song, for comparison.

## Limits

An event applies just before the next scheduled slice (the scheduler reads about a tenth of a
second ahead) — the closest a preview gets to the game's immediate jumps.

The **Check** panel reports what would break a map: a branch list with a gap in 0-127, a zone
without a stored position, a missing finish or fade event, a duplicate event number.

## What it is not yet

The binary packers: `.mpf` (the map), `.mus` (the audio stream), the loop bank, and the installer
that patches a rip. The arrangement and the map model are the part they consume — see
[`music-system.md`](music-system.md) for what they have to emit.

## Tests

```
node --test test/engine.test.js
```
