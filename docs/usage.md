# Song creator

A page that turns an audio file into an SSX 3 song arrangement: measures cut on
the beat grid, side material for the top of the control ramp, course-zone
sections, a finish section, and a preview that follows the game's director.

Open `index.html` in a browser. No server, no build step, no dependencies —
the audio never leaves the page.

## Using it

1. **Load audio** (WAV, MP3, OGG, FLAC — whatever the browser decodes) or press
   **Demo loop** to work without a file.
2. **BPM is detected** on load — onset envelope, autocorrelation with a preference for common
   tempos — and written into the field with its confidence, with the first beat as **Offset**.
   Material with no onsets (a pad, a sustained tone) reports no tempo rather than inventing one.
   If the answer is half or double the truth, **×2** / **÷2**: the markings follow the music, not
   the bar number, so nothing is lost. **Beats/measure** is 4 unless the song is in something else.
   The status panel shows the measure length, so a wrong tempo is visible at once.
3. **Select a section** by dragging across bars. The chips that appear under it
   set what the section is: **side material** (heard only at the top of the
   control value, as the game's own songs do), **course zone** (the game enters
   it by event *N* and leaves it by *N+1*, and the song returns to where it was —
   a call and a return, as on the console), **finish** (from there the song
   plays once and ends) or **clear**.
4. **Retype in place**: click a zone to select it — the chips come back with
   "course zone" already lit, so switching it to the finish or to side material is
   one click. Clicking a bar instead toggles side material on it.

**Level.** The **vol** slider is the preview's own level: it changes nothing in the file and
nothing in the export. A hot master is turned down when it loads — the app aims at about -24 dBFS
RMS and only ever turns material down, never up — and the setting is remembered in the browser, so
the next song opens at the level you chose.

**Scrubbing.** The strip along the top of the waveform is the timeline: drag it
to move the playhead, and the file plays under your finger so you can find a
beat or a drop by ear. The position stays where you leave it, and Play starts the
arrangement from the top.
5. **Play** runs the arrangement through the director model: the control value
   ramps 0-127 over the chosen time (13, 17 or 20 s — the three the game uses),
   every measure end takes a branch, and the event buttons jump: `load` (36),
   `finish` (10), `fade out` (19), and each zone's enter/leave pair.
   "demo sequence" fires a zone enter, its leave, the finish and the fade on a
   timer, so you can hear the whole flow hands-off.
6. **Export song.json** — the arrangement plus the map it produced; **Export
   map** — the same map as the text dump that `tools/ssx3_music.py` prints for a
   shipped song, for comparison.

## What each section is for

The game decides what plays from two things: where the rider is, and how well the run is going.
The three section types answer those two questions.

**Side material — played when the run goes well.** The control value ramps up over 13-20 s and is
reset by a bail, so this is the layer the game adds and takes away. It has to be the part of the
song that can disappear: drums, bass, a riff with no hook in it. Put the melody here and the song
loses its identity every time the value drops.

*Gameplay: the drums that come in during a long combo and cut the moment you crash; the extra layer
while you hold a fast line down an open slope; nothing at all while you are picking yourself up.*

**Course zone — played where the rider is.** An area of the run: the game fires event *N* on entry,
*N+1* on the way out, and the song returns to where it was. It is a variation, not a second song —
same tempo, same key, different instrument, register or groove, four to sixteen bars — so jumping in
and out never sounds like a mistake.

*Gameplay: rail park — sparse drums, no pads; powder bowl — wide and slow, snare out; tunnel or
canyon — low end, more reverb, tighter; the big kicker — a rise into the hit; a night street section
— brighter, more top end; halfpipe — steady, no fills, because you hear it again on every run.*

Short zones are wasted: switches land on measure boundaries, so a one-bar zone is over before it is
heard, and the Check panel says so. A zone much longer than sixteen bars rarely gets heard at all
before the rider is out of the area.

**Finish — played when the run ends.** Once, then the song ends: the resolve, not another loop.

*Gameplay: the landing after the last jump, the track winding down instead of cutting; the finish
gate where the run is scored.*

**Where to put them.** The natural shape is a main chain that carries the song, two or three zones
on the parts of the run that look different, side material on the chorus-equivalent, and the finish
on the outro. Three distinct areas in a course means three zones; a zone on a stretch that looks
like the rest of the course is a jump nobody can explain.

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
