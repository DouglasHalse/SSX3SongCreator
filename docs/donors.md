# Donors

Writing a Pathfinder v4 map is the expensive part of making a song for this game: node tables,
branch ranges over 0-127, event actions, a loop bank. A **donor** avoids it. You take a shipped
song's map as it is and supply the audio underneath, so the map's branches, zone jumps and finish
stay valid and your track inherits them.

## Why it works

A node names a sample by **track + index**, and the sample table carries each slice's length in
milliseconds. Branches only choose between indices. So a map is a graph over slots, and the only
thing your song has to respect is the *grid*: one slice is one bar of your track.

That leaves two things to get right:

- **The grid.** A slice is `BeatsPerMeasure` beats at the song's BPM, and the director times its
  transitions off that, so every slice must be that long. If your track is at another tempo, either
  cut it at the donor's tempo, time-stretch it, or rewrite the song's BPM when the map writer exists.
- **The event numbers.** Courses fire zone events by number (Snow Jam fired 1, 2, 9, then 10 at the
  finish), and the song has to answer them, so a donor from the course you are writing for is the
  safe choice.

## What the page does with a donor

Pick one in the **Donor song** panel. It states the donor's grid, slice count, samples and loop
bank, then checks your arrangement against it and marks what is missing:

- ✓ or × for the grid, for each zone event the donor answers, for the finish, and for high-value
  material;
- `?` where the profile has not measured the answer yet — it says so instead of guessing;
- **Cut my track at the donor's grid** retimes the bar grid in one click, carrying your markings
  across by time;
- **Renumber my zones** gives them the donor's event numbers in the order they sit in the song. The
  number has to be the one the course fires, so each zone row also takes a number by hand.

One number can carry several actions, and the shipped maps rely on that: a course's last zone often
leaves on the same event that ends the run (Snow Jam's event 10). The map builder merges them, so a
zone answering 1 and 9 plus a finish validates cleanly.

## The profiles

`donors.js` holds them; they are loaded with a script tag so the page works from `file://`. Fields:

| field | meaning |
|---|---|
| `bpm`, `bpmInf`, `beatsPerMeasure`, `measureSeconds` | the grid; `bpmInf` is what `music.inf` declares when it differs |
| `samples`, `slices`, `nodes`, `events` | what the map holds |
| `zones` | the zone event numbers the song answers, or `null` |
| `loopBank` | sounds in its loop bank, or `null` |
| `sources` | `map` = measured from its files, `trace` = seen in a race |
| `note` | whatever is still unmeasured |

Three ship today: **Deep End** (grid and counts measured; zone numbers not), **Emerge** (grid and
slice count), **Snow Jam** (event numbers from a race trace; grid not measured). Fill the gaps by
running a scan over your own rip — the profiles are plain data, so adding one is a copy and edit.

## Limits of the approach

You inherit the donor's shape: its zone count, its branch widths, its slice count, and its loop
bank. A donor without a loop bank leaves the menus quiet. Full freedom — new slots, your own branch
layout, your own loop bank — needs the `.mpf` writer, which does not exist yet.
