/* The arrangement model has to behave like the game's director: measured against
 * the rules in docs/music-system.md. Run with: node --test tools/songcreator/test */
var test = require('node:test');
var assert = require('node:assert');
var E = require('../engine.js');

function arrangement(over) {
    var a = {
        title: 'T', artist: 'A', bpm: 92, beatsPerMeasure: 4, rampSeconds: 17,
        measures: E.measures({ bpm: 92, beatsPerMeasure: 4, duration: 24, offset: 0 }),
        roles: [], zones: [{ event: 1, from: 2, to: 3 }], finishFrom: 6
    };
    a.roles = a.measures.map(function (m, i) { return i === 4 ? 'side' : 'normal'; });
    return Object.assign(a, over || {});
}

function walk(player, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
        var r = player.step();
        out.push(r ? r.measure : null);
    }
    return out;
}

test('a measure is four beats at the tempo', function () {
    var ms = E.measures({ bpm: 92, beatsPerMeasure: 4, duration: 24, offset: 0 });
    var slice = 60 / 92 * 4;
    assert.strictEqual(ms.length, 9);
    ms.forEach(function (m) {
        assert.ok(Math.abs((m.end - m.start) - slice) < 1e-9, 'measure ' + m.index + ' is one measure');
    });
    assert.ok(ms[8].end <= 24);
});

test('every node answers every value', function () {
    var a = arrangement();
    var map = E.build(a);
    map.nodes.forEach(function (n) {
        if (!n.branches.length) {
            assert.ok(n.terminal, 'only the end of the finish section may have no branch');
            return;
        }
        var seen = new Array(128).fill(false);
        n.branches.forEach(function (b) { for (var v = b.lo; v <= b.hi; v++) seen[v] = true; });
        assert.ok(seen.every(Boolean), 'node ' + n.id + ' leaves a gap');
    });
    var v = E.validate(map, a);
    assert.deepStrictEqual(v.errors, []);
});

test('the entry lands on audio, not on the junction', function () {
    var p = new E.Player(E.build(arrangement()), {});
    assert.strictEqual(p.node.kind, 'audio');
    assert.strictEqual(p.node.measure, 0);
});

test('a low value never plays the side measure', function () {
    var p = new E.Player(E.build(arrangement()), {});
    p.setValue(0);
    assert.deepStrictEqual(walk(p, 8), [0, 1, 2, 3, 5, 6, 7, 8]);
});

test('a high value plays the side measure where it sits', function () {
    var p = new E.Player(E.build(arrangement()), {});
    p.setValue(120);
    assert.deepStrictEqual(walk(p, 6), [0, 1, 2, 3, 4, 5]);

    /* the same walk at a low value steps over it */
    var q = new E.Player(E.build(arrangement()), {});
    q.setValue(0);
    assert.deepStrictEqual(walk(q, 6), [0, 1, 2, 3, 5, 6]);
});

test('entering a zone calls and leaving returns', function () {
    var p = new E.Player(E.build(arrangement()), {});
    p.setValue(0);
    walk(p, 2);                                    /* played 0 and 1, sitting on 2 */
    assert.ok(p.fire(1), 'event 1 exists');
    assert.strictEqual(p.node.measure, 2);
    assert.deepStrictEqual(walk(p, 3), [2, 3, 2], 'the zone loops on itself');
    p.fire(2);
    assert.strictEqual(p.node.measure, 2, 'back to where the song was');
});

test('the finish section ends the song', function () {
    var p = new E.Player(E.build(arrangement()), {});
    p.setValue(0);
    p.fire(E.EVENT.FINISH);
    assert.strictEqual(p.node.measure, 6);
    var out = walk(p, 4);
    assert.deepStrictEqual(out.slice(0, 3), [6, 7, 8]);
    assert.strictEqual(out[3], null, 'nothing after the last measure');
});

test('the ramp reaches the top of its range', function () {
    var p = new E.Player(E.build(arrangement()), { rampSeconds: 17 });
    assert.strictEqual(p.rampValue(0), 0);
    assert.strictEqual(p.rampValue(8.5), 64);
    assert.strictEqual(p.rampValue(17), 127);
    assert.strictEqual(p.rampValue(60), 127);
});

test('validation catches the failures the format invites', function () {
    var a = arrangement({ zones: [{ event: 3, from: 1, to: 2 }] });
    var map = E.build(a);
    /* a gap in a branch list: the chain stops when the value lands in it */
    map.nodes[1].branches = [{ lo: 0, hi: 50, to: 2 }];
    var v = E.validate(map, a);
    assert.ok(v.errors.some(function (e) { return /no branch for value 51/.test(e); }));

    /* a zone entered without storing a position never returns */
    var a2 = arrangement();
    var m2 = E.build(a2);
    m2.events.forEach(function (e) {
        if (e.number === 1) e.actions = [{ type: 'goto', node: e.actions[1].node }];
    });
    var v2 = E.validate(m2, a2);
    assert.ok(v2.errors.some(function (e) { return /without storing/.test(e); }));
});

test('the dump reads like the shipped maps', function () {
    var a = arrangement();
    var text = E.toText(E.build(a), a);
    assert.match(text, /T by A: BPM 92, BeatsPerMeasure 4, 9 measures/);
    assert.match(text, /1: store position in register 1; go to node \d+/);
    assert.match(text, /2: return to register 1/);
    assert.match(text, /10: go to node \d+/);
});

/* ---- tempo detection ---------------------------------------------------- */

function clicks(bpm, seconds, rate, firstAt) {
    var n = Math.floor(seconds * rate), d = new Float32Array(n), beat = 60 / bpm;
    for (var t = firstAt || 0; t < seconds; t += beat) {
        var s = Math.floor(t * rate);
        for (var i = 0; i < Math.floor(rate * 0.06) && s + i < n; i++) {
            var e = Math.exp(-i / (rate * 0.012));
            d[s + i] += (Math.sin(2 * Math.PI * 80 * i / rate) * 0.8 + (Math.random() * 2 - 1) * 0.5) * e;
        }
    }
    return d;
}

test('finds the tempo of a click track', function () {
    [92, 120, 128].forEach(function (bpm) {
        var r = E.detectTempo([clicks(bpm, 24, 44100)], 44100);
        assert.ok(r, 'detected something at ' + bpm);
        assert.ok(Math.abs(r.bpm - bpm) < 1, bpm + ' came back as ' + r.bpm.toFixed(1));
    });
});

test('an octave is reported as one or the other, never as a wrong tempo', function () {
    var r = E.detectTempo([clicks(174, 24, 44100)], 44100);
    assert.ok(r);
    var near = Math.abs(r.bpm - 174) < 2 || Math.abs(r.bpm * 2 - 174) < 2;
    assert.ok(near, '174 came back as ' + r.bpm.toFixed(1));
});

test('the first beat becomes the bar offset', function () {
    var r = E.detectTempo([clicks(120, 24, 44100, 0.25)], 44100);
    assert.ok(r);
    var off = r.offset;
    var err = Math.min(Math.abs(off - 0.25), Math.abs(off - 0.25 + r.beat), Math.abs(off - 0.25 - r.beat));
    assert.ok(err < 0.04, 'offset came back as ' + off.toFixed(3));
});

test('material with no onsets has no tempo', function () {
    var pad = new Float32Array(44100 * 8);
    for (var i = 0; i < pad.length; i++) {
        pad[i] = (Math.sin(2 * Math.PI * 110 * i / 44100) + Math.sin(2 * Math.PI * 220 * i / 44100)) * 0.2;
    }
    assert.strictEqual(E.detectTempo([pad], 44100), null);
});

test('too little audio is refused', function () {
    assert.strictEqual(E.detectTempo([clicks(120, 1, 44100)], 44100), null);
});

/* ---- structural advice -------------------------------------------------- */

function oneZone(bars) {
    return {
        title: 't', artist: '', bpm: 120, beatsPerMeasure: 4, rampSeconds: 17,
        source: { name: 'x', duration: 60 },
        measures: E.measures({ bpm: 120, beatsPerMeasure: 4, duration: 60, offset: 0 }),
        roles: E.measures({ bpm: 120, beatsPerMeasure: 4, duration: 60, offset: 0 }).map(function () { return 'normal'; }),
        zones: [{ event: 1, from: 2, to: 2 + bars - 1, name: 'zone 1' }],
        finishFrom: null
    };
}

test('a one-bar zone is called out, a four-bar zone is not', function () {
    var short = oneZone(1);
    var w = E.validate(E.build(short), short).warnings.join(' ');
    assert.match(w, /one bar/, 'expected a length warning, got: ' + w);

    var ok = oneZone(4);
    var w2 = E.validate(E.build(ok), ok).warnings.join(' ');
    assert.doesNotMatch(w2, /one bar/);
    assert.doesNotMatch(w2, /rider is usually through/);
});

test('a very long zone is called out', function () {
    var long = oneZone(24);
    var w = E.validate(E.build(long), long).warnings.join(' ');
    assert.match(w, /rider is usually through an area/);
});

test('one bar of side material blips', function () {
    var a = oneZone(4);
    a.roles[0] = 'side';
    var w = E.validate(E.build(a), a).warnings.join(' ');
    assert.match(w, /side material of one bar/);
});

/* ---- seeking ------------------------------------------------------------ */

test('a seek lands on the measure under the cursor', function () {
    var a = oneZone(4);
    a.roles[6] = 'side';
    var map = E.build(a);
    var p = new E.Player(map, { rampSeconds: 17 });

    assert.ok(p.seekToMeasure(5));
    assert.strictEqual(p.node.measure, 5, 'main chain measure');

    /* side material has a node of its own, and that is what plays it */
    assert.ok(p.seekToMeasure(6));
    assert.strictEqual(p.node.measure, 6);

    /* inside a zone the main chain copy wins: that is what plays without an event */
    assert.ok(p.seekToMeasure(3));
    assert.strictEqual(p.node.measure, 3);
    assert.strictEqual(p.node.id, map.ids.main[3]);

    assert.strictEqual(p.seekToMeasure(999), false, 'a measure outside the song is refused');
});

test('playback carries on from where it was seeked to', function () {
    var a = oneZone(4);
    var map = E.build(a);
    var p = new E.Player(map, { rampSeconds: 17 });
    p.setValue(0);
    p.seekToMeasure(5);
    p.step();
    assert.strictEqual(p.node.measure, 6, 'stepping from measure 5 lands on 6');
});
