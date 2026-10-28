/* Donor songs. A donor is a shipped song whose map you inherit instead of
 * writing one: it fixes the grid (one slice is one measure at its tempo), the
 * events your song has to answer, and whether it carries a loop bank. Only
 * measured facts are recorded here; a null means "not measured yet", and the
 * page says so rather than guessing.
 *
 * Sources:
 *   'map'    the song's own sample table / node table
 *   'trace'  what the game did during a race (event numbers, timings)
 */
window.SSX3_DONORS = [
    {
        id: 'deep-end',
        title: 'Deep End',
        sources: ['map'],
        bpm: 184,
        bpmInf: 92,
        beatsPerMeasure: 4,
        measureSeconds: 1.3043,
        samples: 448,
        slices: 434,
        nodes: 520,
        events: 44,
        zones: null,
        loopBank: 50,
        note: 'Zone event numbers are not measured yet.'
    },
    {
        id: 'emerge',
        title: 'Emerge',
        sources: ['map'],
        bpm: 135,
        bpmInf: null,
        beatsPerMeasure: 4,
        measureSeconds: 1.7778,
        samples: null,
        slices: 421,
        nodes: null,
        events: null,
        zones: null,
        loopBank: null,
        note: 'Sample count, events and zone numbers are not measured yet.'
    },
    {
        id: 'snow-jam',
        title: 'Snow Jam',
        sources: ['trace'],
        bpm: null,
        bpmInf: null,
        beatsPerMeasure: null,
        measureSeconds: null,
        samples: null,
        slices: null,
        nodes: null,
        events: null,
        zones: [1, 9],
        loopBank: null,
        note: 'In a race it fired 1 (~90 s), 2 (~140 s), 9 (~220 s) and 10 at the finish: entering ' +
              'zone 1, leaving it (2 = 1+1), entering zone 9, then the finish. Its grid and slice ' +
              'count are not measured yet.'
    }
];
