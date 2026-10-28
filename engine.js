/* The arrangement model: an audio file cut into measures, built into the kind of
 * Pathfinder map SSX 3's music director plays, plus a simulator of that map.
 *
 * The map is the game's own shape (see docs/music-system.md): a list of nodes,
 * each a slice of audio or a junction, and each ending with branches keyed on a
 * 0-127 control value; events with numbered actions jump around (call/return
 * for course music zones, a fade at the finish).
 *
 * Runs in the browser (window.SSX3) and under node (module.exports).
 */
var SSX3 = (function () {
    'use strict';

    /* The game ramps the control value as 127 * updates / T, and resets it on
     * rider events; T is one of these, chosen per player. */
    var RAMP_UPDATES = { 13: 800, 17: 1000, 20: 1200 };

    /* Events SSX 3 fires that a song has to answer. */
    var EVENT = {
        START: 0,
        FINISH: 10,
        FADE_OUT: 19,
        LOAD: 36
    };

    /* ---------------------------------------------------------------- demo */

    /* A drum/bass loop, so the app is usable with no audio file at all. */
    function demoBuffer(ctx, seconds) {
        var rate = ctx.sampleRate;
        var n = Math.floor(rate * seconds);
        var buf = ctx.createBuffer(2, n, rate);
        var bpm = 92, beat = 60 / bpm;
        var notes = [0, 3, 5, 7, 5, 3, 0, -2];
        for (var ch = 0; ch < 2; ch++) {
            var d = buf.getChannelData(ch);
            for (var i = 0; i < n; i++) {
                var t = i / rate;
                var bar = Math.floor(t / (beat * 4));
                var step = Math.floor(t / (beat / 2)) % 8;
                var v = 0;
                /* kick on the beat, hat on the offbeat */
                var inBeat = t % beat;
                if (step % 2 === 0) {
                    v += Math.sin(2 * Math.PI * 55 * inBeat) * Math.exp(-30 * inBeat) * 0.5;
                }
                v += (Math.random() * 2 - 1) * Math.exp(-90 * inBeat) * (step % 2 ? 0.06 : 0.02);
                /* bass line */
                var semis = notes[(bar * 2 + (step >> 2)) % notes.length];
                var f = 110 * Math.pow(2, semis / 12);
                v += Math.sin(2 * Math.PI * f * t) * 0.16 * (0.6 + 0.4 * Math.exp(-6 * inBeat));
                /* a lead that only exists in alternate bars, so a branch jump is audible */
                if (bar % 2 === 1) {
                    v += Math.sin(2 * Math.PI * f * 4 * t) * 0.10 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t));
                }
                d[i] = Math.max(-1, Math.min(1, v * (ch ? 0.95 : 1)));
            }
        }
        return buf;
    }

    /* ------------------------------------------------------------- timeline */

    /* Where each measure sits in the source audio. The last measure is trimmed
     * to whatever audio is left, so a song need not be a whole number of bars. */
    function measures(opts) {
        var beat = 60 / opts.bpm;
        var slice = beat * (opts.beatsPerMeasure || 4);
        var count = Math.max(1, Math.floor((opts.duration - (opts.offset || 0)) / slice));
        var out = [];
        for (var i = 0; i < count; i++) {
            var start = (opts.offset || 0) + i * slice;
            out.push({ index: i, start: start, end: Math.min(start + slice, opts.duration), beats: opts.beatsPerMeasure || 4 });
        }
        return out;
    }

    /* ------------------------------------------------------------ the map */

    function node(kind, measure, id) {
        return { id: id, kind: kind, measure: measure === undefined ? null : measure, branches: [] };
    }

    function edge(lo, hi, to) {
        return { lo: lo, hi: hi, to: to };
    }

    /* Build the map from the arrangement. Node 0 is the entry junction.
     *
     *   main chain   normal measures in order, each ending on
     *                [0..100 -> next main] [100..127 -> next side measure]
     *   side nodes   measures marked "side": audio only reachable with a high
     *                value, and they hand back to the main chain
     *   zones        a section that loops on itself, entered by event N with
     *                "store position" and left by event N+1 with "return"
     *   finish       a section entered by event 10, ending in a stop
     */
    function build(arr) {
        var map = { nodes: [], events: [], entry: 0, meta: {
            title: arr.title || 'Untitled', artist: arr.artist || '',
            bpm: arr.bpm, beatsPerMeasure: arr.beatsPerMeasure || 4,
            rampSeconds: arr.rampSeconds || 17, measures: arr.measures.length
        } };
        var ids = { main: {}, side: {}, zones: [], finish: [] };
        var nextId = 0;

        var entry = node('junction', null, nextId++);
        map.nodes.push(entry);

        /* main chain, skipping nothing: every measure is a node, but a side
         * node is only reachable from the branch, never by falling through */
        var role = arr.roles || [];
        var normal = [], side = [];
        for (var i = 0; i < arr.measures.length; i++) {
            var kind = role[i] || 'normal';
            if (kind === 'side') side.push(i); else normal.push(i);
        }
        normal.forEach(function (m) {
            var n = node('audio', m, nextId++);
            ids.main[m] = n.id;
            map.nodes.push(n);
        });
        side.forEach(function (m) {
            var n = node('audio', m, nextId++);
            ids.side[m] = n.id;
            map.nodes.push(n);
        });

        var top = normal.length ? ids.main[normal[0]] : entry.id;
        map.nodes[entry.id].branches.push(edge(0, 127, top));

        /* Chain the main measures. A side measure is an exit offered by the one
         * measure right before it: low value skips it, high value plays it and
         * comes back to the next main measure. */
        normal.forEach(function (m, idx) {
            var n = map.nodes[ids.main[m]];
            var nxt = normal[idx + 1];
            var exit = (m + 1 < arr.measures.length && role[m + 1] === 'side') ? m + 1 : null;
            if (nxt === undefined) {
                n.branches.push(edge(0, 127, top));
            } else if (exit !== null) {
                n.branches.push(edge(0, 100, ids.main[nxt]));
                n.branches.push(edge(100, 127, ids.side[exit]));
            } else {
                n.branches.push(edge(0, 127, ids.main[nxt]));
            }
        });

        /* a side measure hands on to whatever follows it in the song */
        side.forEach(function (m) {
            var n = map.nodes[ids.side[m]];
            var after = m + 1;
            if (after < arr.measures.length && role[after] === 'side')
                n.branches.push(edge(0, 127, ids.side[after]));
            else if (after < arr.measures.length && ids.main[after] !== undefined)
                n.branches.push(edge(0, 127, ids.main[after]));
            else
                n.branches.push(edge(0, 127, top));
        });

        /* zones: a looping section, event N enters, event N+1 returns */
        (arr.zones || []).forEach(function (z, zi) {
            var chain = [];
            for (var m = z.from; m <= z.to; m++) {
                var zn = node('audio', m, nextId++);
                map.nodes.push(zn);
                chain.push(zn.id);
            }
            chain.forEach(function (id, k) {
                var to = (k + 1 < chain.length) ? chain[k + 1] : chain[0];
                map.nodes[id].branches.push(edge(0, 127, to));
            });
            ids.zones.push({ event: z.event, first: chain[0], last: chain[chain.length - 1] });
        });

        /* finish: play from finishFrom to the end once, then stop */
        if (arr.finishFrom !== undefined && arr.finishFrom !== null) {
            var fchain = [];
            for (var m = arr.finishFrom; m < arr.measures.length; m++) {
                var fn = node('audio', m, nextId++);
                map.nodes.push(fn);
                fchain.push(fn.id);
            }
            fchain.forEach(function (id, k) {
                if (k + 1 < fchain.length)
                    map.nodes[id].branches.push(edge(0, 127, fchain[k + 1]));
                else
                    map.nodes[id].terminal = true;   /* the song ends here */
            });
            ids.finish = fchain;
        }

        var start = top;

        /* events */
        function ev(number, actions) {
            map.events.push({ number: number, actions: actions });
        }
        var first = start;
        ev(EVENT.START, [{ type: 'goto', node: first }]);
        ev(EVENT.LOAD, [{ type: 'goto', node: first }]);
        if (ids.finish.length) {
            ev(EVENT.FINISH, [{ type: 'goto', node: ids.finish[0] }]);
            ev(EVENT.FADE_OUT, [
                { type: 'fade', ms: 3000, level: 0 },
                { type: 'wait', ms: 3100 },
                { type: 'stop' }
            ]);
        }
        ids.zones.forEach(function (z, i) {
            var reg = i + 1;                    /* registers 1..5 in the shipped maps */
            ev(z.event, [{ type: 'store', reg: reg }, { type: 'goto', node: z.first }]);
            ev(z.event + 1, [{ type: 'return', reg: reg }]);
        });
        map.events.sort(function (a, b) { return a.number - b.number; });

        return map;
    }

    /* ------------------------------------------------------------ checking */

    /* The failures docs/music-system.md lists for a hand-modded song. */
    function validate(map, arr) {
        var errors = [], warnings = [];
        var evs = {};
        map.events.forEach(function (e) {
            if (evs[e.number]) errors.push('event ' + e.number + ' is defined twice');
            evs[e.number] = e;
            if (e.number > 63) errors.push('event ' + e.number + ' is above 63');
            if (e.actions.length > 63) errors.push('event ' + e.number + ' has more than 63 actions');
        });

        map.nodes.forEach(function (n) {
            if (n.kind !== 'audio' && n.kind !== 'junction') return;
            if (!n.branches.length) {
                if (!n.terminal)
                    warnings.push('node ' + n.id + ' has no branch: the chain ends there');
                return;
            }
            var covered = new Array(128).fill(false);
            n.branches.forEach(function (b) {
                for (var v = b.lo; v <= b.hi; v++) covered[v] = true;
            });
            var gap = covered.indexOf(false);
            if (gap >= 0) errors.push('node ' + n.id + ' has no branch for value ' + gap +
                ' (a song that reaches it stops there)');
        });

        (arr.zones || []).forEach(function (z) {
            var enter = evs[z.event], leave = evs[z.event + 1];
            if (!enter) errors.push('zone ' + (z.name || z.from + '-' + z.to) + ' has no enter event ' + z.event);
            else if (!enter.actions.some(function (a) { return a.type === 'store'; }))
                errors.push('event ' + z.event + ' enters a zone without storing the position: it never returns');
            if (!leave) errors.push('zone ' + (z.name || z.from + '-' + z.to) + ' has no leave event ' + (z.event + 1));
            else if (!leave.actions.some(function (a) { return a.type === 'return'; }))
                errors.push('event ' + (z.event + 1) + ' leaves a zone without returning');
            if (z.from < 0 || z.to >= arr.measures.length) errors.push('zone ' + z.event + ' is outside the song');
        });

        var regs = {};
        (arr.zones || []).forEach(function (z, i) {
            var r = i + 1;
            if (regs[r]) errors.push('register ' + r + ' is used by two zones');
            regs[r] = true;
        });

        if (map.nodes.length > 65000) errors.push('too many nodes for the map');
        if (!evs[EVENT.FINISH]) warnings.push('no finish event (10): the run ends with the song still playing');
        if (!evs[EVENT.FADE_OUT]) warnings.push('no fade-out event (19)');

        return { errors: errors, warnings: warnings };
    }

    /* ---------------------------------------------------------- simulation */

    /* The game's music director, as far as a song can tell: a control value that
     * ramps and can be reset, events that jump, and a branch taken at every node
     * end. Used for the preview and for the tests. */
    function Player(map, opts) {
        this.map = map;
        this.byId = {};
        var self = this;
        map.nodes.forEach(function (n) { self.byId[n.id] = n; });
        this.eventsByNo = {};
        map.events.forEach(function (e) { self.eventsByNo[e.number] = e; });
        this.rampSeconds = opts.rampSeconds || map.meta.rampSeconds || 17;
        this.value = 0;
        this.regs = {};
        this.entry = map.entry;
        this.node = this.byId[this.entry];
        this.skipJunctions();
        this.pending = [];      /* actions waiting on a wait ms */
        this.stopped = false;
        this.visits = [];
    }

    Player.prototype.setValue = function (v) { this.value = Math.max(0, Math.min(127, Math.round(v))); };

    /* What the game's ramp gives after `elapsed` seconds since the last reset. */
    Player.prototype.rampValue = function (elapsed) {
        var t = Math.min(1, elapsed / this.rampSeconds);
        return Math.round(127 * t);
    };

    /* Junctions play nothing: follow them until the player stands on audio. */
    Player.prototype.skipJunctions = function () {
        for (var guard = 0; guard < 64 && this.node && this.node.kind === 'junction'; guard++) {
            var b = this.node.branches[0];
            if (!b) break;
            this.node = this.byId[b.to] || null;
        }
        return this.node;
    };

    Player.prototype.fire = function (number) {
        var e = this.eventsByNo[number];
        if (!e) return false;
        this.run(e.actions);
        return true;
    };

    Player.prototype.run = function (actions) {
        for (var i = 0; i < actions.length; i++) {
            var a = actions[i];
            if (a.type === 'goto') { if (this.byId[a.node]) this.node = this.byId[a.node]; }
            else if (a.type === 'store') this.regs[a.reg] = this.node.id;
            else if (a.type === 'return') {
                var back = this.regs[a.reg];
                if (back !== undefined && this.byId[back]) this.node = this.byId[back];
            } else if (a.type === 'stop') this.stopped = true;
            /* wait and fade do not change position */
        }
    };

    /* Take the branch the value selects at the end of the current node. */
    Player.prototype.step = function () {
        if (this.stopped) return null;
        var n = this.node;
        if (!n) return null;
        var v = this.value;
        var taken = null;
        for (var i = 0; i < n.branches.length; i++) {
            var b = n.branches[i];
            if (v >= b.lo && v <= b.hi) { taken = b; break; }
        }
        /* A node with no branch still plays its slice: that is the end of the
         * song (the finish section's tail), not a missing branch. */
        var rec = { from: n.id, measure: n.measure, value: v, to: taken ? taken.to : null };
        this.node = taken ? (this.byId[taken.to] || null) : null;
        if (!taken) this.stopped = true;
        this.visits.push(rec);
        return rec;
    };

    /* ------------------------------------------------------------- exports */

    /* A dump in the shape of tools/ssx3_music.py, so a creator's map can be
     * diffed against a shipped one. */
    function toText(map, arr) {
        var lines = [];
        var m = map.meta;
        lines.push(m.title + (m.artist ? ' by ' + m.artist : '') + ': BPM ' + m.bpm +
            ', BeatsPerMeasure ' + m.beatsPerMeasure + ', ' + m.measures + ' measures');
        lines.push('map: ' + map.nodes.length + ' nodes, ' + map.events.length + ' events');
        lines.push('');
        lines.push('events:');
        map.events.forEach(function (e) {
            lines.push('  ' + String(e.number).padStart(2, ' ') + ': ' + e.actions.map(describe).join('; '));
        });
        lines.push('');
        lines.push('nodes (what plays, then: next node [lo..hi of the 0-127 value]):');
        map.nodes.forEach(function (n) {
            var what = n.kind === 'audio' ? 'measure ' + n.measure : 'junction';
            var br = n.branches.map(function (b) {
                return b.to + ' [' + b.lo + '..' + b.hi + ']';
            }).join(', ') || 'end';
            lines.push('  ' + String(n.id).padStart(4, ' ') + ' ' + what.padEnd(18) + ' -> ' + br);
        });
        return lines.join('\n');
    }

    function describe(a) {
        if (a.type === 'goto') return 'go to node ' + a.node;
        if (a.type === 'store') return 'store position in register ' + a.reg;
        if (a.type === 'return') return 'return to register ' + a.reg;
        if (a.type === 'wait') return 'wait ' + a.ms + ' ms';
        if (a.type === 'fade') return 'fade over ' + a.ms + ' ms to ' + a.level;
        if (a.type === 'stop') return 'stop';
        return a.type;
    }

    /* The arrangement as this app stores it, with the derived map. */
    function songFile(arr, map) {
        return {
            format: 'ssx3-song/1',
            title: arr.title,
            artist: arr.artist,
            bpm: arr.bpm,
            beatsPerMeasure: arr.beatsPerMeasure,
            measuresPerBar: arr.measuresPerBar || 2,
            rampSeconds: arr.rampSeconds,
            source: arr.source,
            roles: arr.roles,
            zones: arr.zones,
            finishFrom: arr.finishFrom,
            map: map,
            dump: toText(map, arr)
        };
    }

    return {
        RAMP_UPDATES: RAMP_UPDATES,
        EVENT: EVENT,
        demoBuffer: demoBuffer,
        measures: measures,
        build: build,
        validate: validate,
        Player: Player,
        toText: toText,
        songFile: songFile
    };
})();

if (typeof module !== 'undefined') module.exports = SSX3;
