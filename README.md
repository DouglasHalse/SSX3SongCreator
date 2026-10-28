# SSX3SongCreator

Make your own songs for **SSX 3**'s interactive soundtrack.

The game does not play a music file: it plays a *map*. `<song>.mpf` is a graph of one-measure
slices, and at the end of every slice a 0-127 control value — ramped by the game while you ride,
reset by impacts — picks which slice comes next. Numbered events steer it further: a course's
music zones are call-and-return jumps, the finish has its own section, the loading screen another.
A usable song therefore needs a map that answers all of that, not just audio.

This project builds such songs. It is **standalone**: no code from the recompilation ports, no
game data. The ports are only where a finished song gets tested.

## Run it

Open [`index.html`](index.html) in a browser. No build step, no dependencies, and the audio never
leaves the page.

1. **Load audio** (whatever the browser decodes) or press **Demo loop** to try it with no file.
2. The tempo is detected on load (and the first beat becomes the offset); **×2** / **÷2** if it
   lands an octave off, and **Beats/measure** if the song is not in 4.
3. Click a measure to mark it **side material** — heard only at the top of the control value, as
   the game's own songs do. Click again to clear it.
4. Drag a range, then **Zone from selection** (a course music zone, entered by event *N* and left
   by *N+1*) or **Finish from selection** (from there the song plays once and ends).
5. **Play** runs it through the game's director: the value ramps over 13, 17 or 20 s, every
   measure end takes a branch, and the event buttons jump — `load` (36), `finish` (10),
   `fade out` (19), each zone's enter/leave. **demo sequence** fires all of it on a timer.
6. **Export song.json** (the arrangement and the map it produced) or **Export map** (the dump
   `ssx3_music.py` prints for a shipped song, for comparison).

## Status

- **Done**: tempo detection, measures cut on the beat grid, side material, zones with call/return, the finish
  section, a simulation of the game's music director, and both exports.
- **Next**: the packers — `.mpf` writer, `.mus` muxer (the stream format also carries 16-bit PCM,
  which would avoid an ADPCM encoder for a first version), loop-bank writer, and the installer
  that patches a rip. [`docs/music-system.md`](docs/music-system.md) records what they owe.

## Testing a song in the game

Until the packers land, a song is tested by replacing a slot in a rip and playing it in the
recompiled game:

- the port traces the music director with `RECOMP_MUSIC_TRACE=1` (events with call chains, control
  values, the loop overlay switching);
- audio and map live in `data/audio/music.big` / `music2.big` and `data/config/music.inf`;
- on the phone the rip lives under `Android/data/com.douglashalse.ssx3/files/ssx3/`.

## Docs

- [`docs/music-system.md`](docs/music-system.md) — the files, the map, the control value, the
  events, the loop bank, and the ways a hand-made song breaks.
- [`docs/usage.md`](docs/usage.md) — the app, control by control.

## Tests

```
node --test test/engine.test.js
```

## Credit

The understanding of the format, the control ramp, the event meanings and the loop bank comes
from koenhendriks' research on
[`music-research`](https://github.com/koenhendriks/SSX3-recomp/tree/music-research)
(`docs/MUSIC.md` and `tools/ssx3_music.py` there). No game code, map or audio is included in this
repository; you need your own rip.

## License

MIT (see [LICENSE](LICENSE)).
