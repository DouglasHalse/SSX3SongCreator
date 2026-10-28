# What a song for SSX 3 is

Notes for the creators in this repository: the game's music files, how its music director drives
them, and therefore what a song has to contain. Sources are the research branch
[`music-research`](https://github.com/koenhendriks/SSX3-recomp/tree/music-research) of the game
repo (`docs/MUSIC.md`, `tools/ssx3_music.py`) plus the shipped files themselves. Nothing here is
copied from the game.

## The files

| File | Role |
|---|---|
| `data/config/music.inf` | per song: title, artist, file names, tempo, levels, whether it ducks for loops |
| `<song>.mpf` | the map (EA "Pathfinder" version 4, little-endian on Xbox) |
| `<song>.mus` | the song audio: EA `SCHl` stream blocks, 32 kHz stereo |
| `<song>loops0.mus` | an EA `BNKl` v5 sound bank used while the song is ducked |
| `music.big` / `music2.big` | the archives both live in |

## The map

A list of nodes. An audio node plays one slice; a junction plays nothing. Each node ends with
branches, and each branch covers a range of the **control value** (0-127); the first branch whose
range contains the current value is taken:

```
 24 junction         -> 26 [0..100], 58 [100..127]
 26 sample 132       -> 27 [0..100], 59 [100..127]
```

Slices are one measure each (four beats at the song's tempo, or two when the tempo is written at
half speed, as some songs do). The sample table gives each slice's length in ms and where it sits
in the stream.

**The control value** is a ramp: `127 * t / T` where `t` counts game updates since the last reset
and `T` is 800, 1000 or 1200 updates (about 13, 17 or 20 s, chosen per player). The game resets it
on rider events (landings and impacts). So a song drifts from its low-value material to its
high-value material over ~13-20 s and drops back after a bail.

## Events

The game fires numbered events; an event carries a list of actions:

| Action | Meaning |
|---|---|
| go to node *n* | jump (track 1 = the song, track 2 = the loop bank) |
| store position in register *r* | remember where the song was |
| return to register *r* | jump back there |
| wait *ms* | delay the next action |
| fade over *ms* to *v* | volume fade (0-127) |
| stop | end playback |

Numbers that matter, as seen in a race:

| Event | When |
|---|---|
| 0 | the game starts, and an event's start |
| *N* | entering course music zone *N* |
| *N+1* | leaving that zone |
| 10 | the run ends |
| 19 | fade out and stop |
| 36 | an event loads |

A zone is a **call and return**: entering stores the song's position and jumps into the zone's
section; leaving returns to where the song was. That is why a zone section can loop on itself for
minutes without losing the song's place.

## The loop bank

A separate bank of one-beat sounds (16, 32, 48, 56 or 64 of them, plus two stingers of 4-9 beats),
referenced by the map's **track 2** in groups of four per measure. It is a second player, switched
on while the song ducks — the pause menu, movies, some in-game states — and its own control value
picks between its loops. A song without one simply stays quiet in those moments.

## What a creator has to produce

1. **A slice per measure**, cut on the beat grid of the tempo written in `music.inf`. Transitions
   happen at slice ends, so a slice that is short or long throws every later transition off the
   beat.
2. **Branches that cover 0-127 at every node.** A gap means the chain has nowhere to go when the
   value lands in it, and the music stops.
3. **An answer to every event the courses fire** — zone enter/leave pairs, start, finish, load. An
   event with no actions in a map is a moment the music ignores.
4. **A way back from every zone**: the enter event stores a register, the leave event returns to it.
5. **Material for the top of the ramp.** Ranges only reachable at 100-127 are heard ~13-20 s after
   a reset, so a song whose high-value material is thin sounds unchanged for most of a run.

## Where this project is

`tools/songcreator/` implements the arrangement side (slices, roles, zones, finish) and a player
that simulates the director for preview. Still to write: the `.mpf` writer (v4 node/event/sample
tables), the `.mus` muxer (`SCHl` blocks; the format also allows 16-bit PCM codecs, which would
avoid an ADPCM encoder for a first version), the loop-bank writer, and the installer that patches
a rip.

Constraints to respect in the writers: sample offsets in the map are in `0x80`-byte units, so each
slice starts on a `0x80` boundary (the shipped files do); the map's node and event tables are
addressed in 4-byte units; branches carry `[lo..hi]` as two bytes; the loop bank and track 2 change
together.
