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
