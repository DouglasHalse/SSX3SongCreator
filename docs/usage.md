# Song creator

A page that turns an audio file into an SSX 3 song arrangement: measures cut on
the beat grid, side material for the top of the control ramp, course-zone
sections, a finish section, and a preview that follows the game's director.

Open `index.html` in a browser. No server, no build step, no dependencies —
the audio never leaves the page.

## How the music works

A song in this game is not a file that plays from beginning to end. It is **slices** — the track cut
into one bar each — and **a map** saying which slice plays after which.

At the end of every bar the game reads one number, 0-127: how well the run is going. It climbs while
the rider is flowing and is reset by a bail. Low numbers take the calm bars, high numbers take the
busy ones, so the same song gets harder as the run gets better. That is the whole trick behind the
"dynamic" soundtrack: there is no separate fast version of a track, only a branch the number picks.

On top of that the game tells the music what is happening:

| what happens in the run | the game sends | what the song does |
|---|---|---|
| the track is loaded | `load` (36) | starts |
| the rider flows, then bails | nothing — just the value | drifts up to the busy bars, drops back on the bail |
| the rider enters a rail park, a tunnel, a powder bowl | `zone N` | remembers the bar it was on, jumps to that area's bars, loops them |
| the rider leaves that area | `leave N` (event *N+1*) | returns to the remembered bar |
| the rider crosses the finish line | `finish` (10) | plays the ending bars once and stops |
| the music is taken away (menus, movies) | `fade out` (19) | fades out and stops |

## What you do

1. Load a finished track. It is cut into bars at the detected tempo.
2. Decide which bars belong to which state: the normal song, the "going well" bars, one section for
   each distinct area of the course, and the ending. That is the creative work — arranging a linear
   track into a graph, not composing.
3. Press **Sample run** to hear a scripted ride through those states, or drag the cursor and fire the
   events under the track yourself.
4. Export the arrangement. Turning it into the game's `.mpf` and `.mus` files is the packer's job,
   which does not exist yet.

## Using it

1. **Load audio** (WAV, MP3, OGG, FLAC — whatever the browser decodes) or press
   **Demo loop** to work without a file.
2. **BPM is detected** on load — onset envelope, autocorrelation with a preference for common
   tempos — and written into the field with its confidence, with the first beat as **Offset**.
   Material with no onsets (a pad, a sustained tone) reports no tempo rather than inventing one.
   If the answer is half or double the truth, **×2** / **÷2**: the markings follow the music, not
   the bar number, so nothing is lost. **Beats/measure** is 4 unless the song is in something else.
   The status panel shows the measure length, so a wrong tempo is visible at once.
3. **Move the cursor** by dragging the waveform. The position under the pointer is where playback
   will start, and the file plays under your finger so you can hear your way to a boundary.
4. **Mark a section** with **ctrl** (or cmd) + drag. The chips under the selection set what it is:
   **side material** (heard only at the top of the control value, as the game's own songs do),
   **course zone** (the game enters it by event *N* and leaves it by *N+1*, and the song returns to
   where it was — a call and a return, as on the console), **finish** (from there the song plays
   once and ends) or **clear**. **ctrl**-click a zone to select it with "course zone" already lit,
   so retyping it is one click.

## The events under the track

The game does not only play the song, it tells it what is happening: numbered events carrying
actions. They are laid out under the waveform at the point they fire, each marked with what it does,
and pressing one during the preview fires it there — the cursor jumps with the music, so the marker
and the bar under the playhead always agree.

| button | event | fired in a race when | what the song does |
|---|---|---|---|
| **load** | 36 | the game loads this track | start from the top |
| **finish** | 10 | the rider crosses the finish line | jump to the finish section, play it once, stop |
| **fade out** | 19 | the music is being taken away (run over, menu) | fade out and stop rather than cutting |
| **zone *N*** | *N* | the rider enters course zone *N* | store where the song is, jump into that zone's bars, which loop |
| **leave *N*** | *N+1* | the rider leaves that zone | jump back to the stored position |

Every zone takes a **pair** of numbers, which is why `leave 5` is event *6*: the enter event stores
the position and the leave event returns to it. Numbers are identities, not order — the zone that
starts earliest in the song can still be zone 5, because numbers are handed out as zones are made.
The list is sorted by number; the left panel lists the zones in the order a run reaches them.

**Level.** The **vol** slider is the preview's own level: it changes nothing in the file and
nothing in the export. A hot master is turned down when it loads — the app aims at about -24 dBFS
RMS and only ever turns material down, never up — and the setting is remembered in the browser, so
the next song opens at the level you chose.

**Seeking into a zone** plays the main chain, not the zone: the game only enters a zone on an
event, so there is no honest way for a seek to know how the song got there. Use the zone's
`zone N` button in the footer to hear it.

**The strip along the top** of the waveform is the time ruler; you can drag there too.
5. **Play** — or **space** — runs the arrangement from the cursor through the director model.
   Pressing it again stops, and the cursor stays where it stopped. Seeking into the middle starts on
   the measure under the cursor, with the first slice clipped to what is left of it, and the value
   ramp carries on as if the song had been running: the control value
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
