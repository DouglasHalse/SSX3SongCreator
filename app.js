/* The page: audio in, measures out, and a transport that plays the arrangement
 * through the game's director model (engine.js). */
(function () {
    'use strict';

    var E = window.SSX3;
    var $ = function (id) { return document.getElementById(id); };

    var S = {
        ctx: null,
        buffer: null,
        name: '',
        peaks: null,
        bpm: 92, beats: 4, offset: 0, ramp: 17,
        measures: [],
        roles: [],
        zones: [],
        finishFrom: null,
        sel: null,
        map: null,
        check: null,
        player: null,
        playing: false,
        t0: 0,
        nextAt: 0,
        sources: [],
        current: -1,
        demo: [],
        drawQueued: false
    };

    /* ------------------------------------------------------------- inputs */

    function num(id, fallback) {
        var v = parseFloat($(id).value);
        return isFinite(v) ? v : fallback;
    }

    function readInputs() {
        S.bpm = Math.max(20, num('bpm', 92));
        S.beats = Math.max(1, Math.round(num('beats', 4)));
        S.offset = Math.max(0, num('offset', 0));
        S.ramp = parseInt($('ramp').value, 10) || 17;
    }

    /* ------------------------------------------------------------- audio */

    function ensureCtx() {
        if (!S.ctx) S.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (S.ctx.state === 'suspended') S.ctx.resume();
        return S.ctx;
    }

    function setAudio(buffer, name) {
        S.buffer = buffer;
        S.name = name;
        S.peaks = peaksOf(buffer);
        $('srcname').textContent = name + '  (' + buffer.duration.toFixed(1) + ' s, ' +
            buffer.numberOfChannels + ' ch, ' + buffer.sampleRate + ' Hz)';
        stop();
        rebuild();
    }

    function peaksOf(buffer) {
        var n = 2400, out = new Float32Array(n * 2);
        var d = buffer.getChannelData(0);
        var per = Math.max(1, Math.floor(d.length / n));
        for (var i = 0; i < n; i++) {
            var lo = 1, hi = -1, start = i * per, end = Math.min(d.length, start + per);
            for (var j = start; j < end; j += 3) {
                var v = d[j];
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
            out[i * 2] = lo;
            out[i * 2 + 1] = hi;
        }
        return out;
    }

    function loadFile(file) {
        file.arrayBuffer().then(function (ab) {
            return ensureCtx().decodeAudioData(ab);
        }).then(function (buf) {
            setAudio(buf, file.name);
        }).catch(function (err) {
            $('srcname').textContent = 'could not decode ' + file.name + ': ' + err.message;
        });
    }

    function loadDemo() {
        var ctx = ensureCtx();
        setAudio(E.demoBuffer(ctx, 32), 'demo loop');
    }

    /* ---------------------------------------------------------- arrangement */

    function arr() {
        return {
            title: $('title').value || 'Untitled',
            artist: $('artist').value || '',
            bpm: S.bpm,
            beatsPerMeasure: S.beats,
            rampSeconds: S.ramp,
            source: { name: S.name, duration: S.buffer ? S.buffer.duration : 0 },
            measures: S.measures,
            roles: S.roles,
            zones: S.zones,
            finishFrom: S.finishFrom
        };
    }

    /* Tempo or the source changed: re-cut the file and keep the markings that
     * still land inside the song. */
    function rebuild() {
        readInputs();
        var dur = S.buffer ? S.buffer.duration : 0;
        S.measures = dur > 0 ? E.measures({ bpm: S.bpm, beatsPerMeasure: S.beats, duration: dur, offset: S.offset }) : [];
        var roles = [];
        for (var i = 0; i < S.measures.length; i++) roles.push(S.roles[i] || 'normal');
        S.roles = roles;
        S.zones = S.zones.filter(function (z) { return z.to < S.measures.length; });
        if (S.finishFrom !== null && S.finishFrom >= S.measures.length) S.finishFrom = null;
        if (S.sel) {
            S.sel = null;
        }
        cacheMap();
        renderAll();
    }

    function cacheMap() {
        if (!S.measures.length) { S.map = null; S.check = null; return; }
        var a = arr();
        S.map = E.build(a);
        S.check = E.validate(S.map, a);
    }

    /* ------------------------------------------------------------- drawing */

    function queueDraw() {
        if (S.drawQueued) return;
        S.drawQueued = true;
        requestAnimationFrame(function () { S.drawQueued = false; draw(); });
    }

    function draw() {
        var c = $('wave');
        var dpr = window.devicePixelRatio || 1;
        var w = c.clientWidth, h = c.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
            c.width = Math.round(w * dpr);
            c.height = Math.round(h * dpr);
        }
        var g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#0d1116';
        g.fillRect(0, 0, w, h);

        if (!S.buffer || !S.measures.length) {
            g.fillStyle = '#7c8899';
            g.font = '13px ui-sans-serif, system-ui';
            g.fillText(S.buffer ? 'too short for one measure at this tempo' : 'load audio or press “Demo loop” to start', 16, 30);
            return;
        }

        var dur = S.buffer.duration;
        var xOf = function (t) { return (t / dur) * w; };
        var mid = h * 0.46;

        /* waveform */
        g.fillStyle = '#243040';
        var n = S.peaks.length / 2;
        for (var i = 0; i < n; i++) {
            var x = (i / n) * w;
            var lo = S.peaks[i * 2], hi = S.peaks[i * 2 + 1];
            g.fillRect(x, mid - hi * mid * 0.92, Math.max(1, w / n), Math.max(1, (hi - lo) * mid * 0.92));
        }

        /* zones and finish, behind the measure grid */
        S.zones.forEach(function (z) {
            var a = S.measures[z.from], b = S.measures[Math.min(z.to, S.measures.length - 1)];
            g.fillStyle = 'rgba(111,179,255,.10)';
            g.fillRect(xOf(a.start), 0, xOf(b.end) - xOf(a.start), h);
        });
        if (S.finishFrom !== null) {
            var f = S.measures[S.finishFrom];
            g.fillStyle = 'rgba(106,212,139,.10)';
            g.fillRect(xOf(f.start), 0, w - xOf(f.start), h);
        }

        /* measures: lines each measure, brighter each bar; side material amber */
        S.measures.forEach(function (m, i) {
            var x = xOf(m.start);
            var bar = i % (S.beats === 4 ? 4 : 2) === 0;
            g.strokeStyle = bar ? '#39424f' : '#222a34';
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, h);
            g.stroke();
            if (S.roles[i] === 'side') {
                g.fillStyle = 'rgba(240,180,41,.30)';
                g.fillRect(x, h - 16, Math.max(2, xOf(m.end) - x - 1), 16);
            }
        });

        /* measure numbers, every bar */
        g.fillStyle = '#5c6879';
        g.font = '10px ui-monospace, monospace';
        var perBar = S.beats === 4 ? 4 : 2;
        S.measures.forEach(function (m, i) {
            if (i % perBar) return;
            g.fillText(String(i), xOf(m.start) + 3, h - 3);
        });

        /* selection */
        if (S.sel) {
            var a = S.measures[S.sel.a], b = S.measures[S.sel.b];
            g.fillStyle = 'rgba(255,255,255,.10)';
            g.strokeStyle = 'rgba(255,255,255,.5)';
            g.beginPath();
            var x0 = xOf(a.start), x1 = xOf(b.end);
            g.rect(x0, 1, x1 - x0, h - 2);
            g.fill();
            g.stroke();
        }

        /* current measure + playhead */
        if (S.current >= 0 && S.measures[S.current] && S.playing) {
            var m = S.measures[S.current];
            g.fillStyle = 'rgba(111,179,255,.18)';
            g.fillRect(xOf(m.start), 0, xOf(m.end) - xOf(m.start), h);
        }
        if (S.playing) {
            var t = Math.max(0, S.ctx.currentTime - S.t0);
            var x = xOf(Math.min(t, dur));
            g.strokeStyle = '#ffffff';
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, h);
            g.stroke();
        }
    }

    /* ------------------------------------------------------------ the rest */

    function renderZones() {
        var ul = $('zones');
        ul.innerHTML = '';
        if (!S.zones.length) {
            var li = document.createElement('li');
            li.innerHTML = '<span class="muted">no zones — drag a range, then “Zone from selection”</span>';
            ul.appendChild(li);
        }
        S.zones.forEach(function (z, i) {
            var li = document.createElement('li');
            li.innerHTML = '<span class="tag">' + z.event + '/' + (z.event + 1) + '</span>' +
                '<span>measures ' + z.from + '-' + z.to + '</span>' +
                '<span class="muted">' + (S.measures[z.from] ? fmt(S.measures[z.from].start) : '') + '</span>';
            var del = document.createElement('button');
            del.textContent = 'remove';
            del.onclick = function () {
                S.zones.splice(i, 1);
                cacheMap();
                renderAll();
            };
            li.appendChild(del);
            ul.appendChild(li);
        });

        var zb = $('zonebtns');
        zb.innerHTML = '';
        S.zones.forEach(function (z) {
            var inBtn = document.createElement('button');
            inBtn.textContent = 'zone ' + z.event;
            inBtn.onclick = function () { fire(z.event); };
            var outBtn = document.createElement('button');
            outBtn.textContent = 'leave ' + z.event;
            outBtn.onclick = function () { fire(z.event + 1); };
            zb.appendChild(inBtn);
            zb.appendChild(outBtn);
        });
    }

    function renderCheck() {
        var ul = $('check');
        ul.innerHTML = '';
        var items = [];
        if (S.check) {
            S.check.errors.forEach(function (e) { items.push({ cls: 'err', text: e }); });
            S.check.warnings.forEach(function (e) { items.push({ cls: 'warn', text: e }); });
        }
        if (!items.length) items.push({ cls: 'ok', text: 'the map answers every value and every event' });
        items.forEach(function (it) {
            var li = document.createElement('li');
            li.className = it.cls;
            li.innerHTML = '<span>' + it.text + '</span>';
            ul.appendChild(li);
        });

        var dl = $('stats');
        dl.innerHTML = '';
        var stats = S.buffer ? [
            ['length', S.buffer.duration.toFixed(2) + ' s'],
            ['measures', S.measures.length],
            ['measure', S.measures.length ? (S.measures[0].end - S.measures[0].start).toFixed(3) + ' s' : '-'],
            ['side', S.roles.filter(function (r) { return r === 'side'; }).length],
            ['nodes', S.map ? S.map.nodes.length : 0],
            ['events', S.map ? S.map.events.length : 0]
        ] : [['length', 'no audio']];
        stats.forEach(function (kv) {
            var dt = document.createElement('dt');
            dt.textContent = kv[0];
            var dd = document.createElement('dd');
            dd.textContent = kv[1];
            dl.appendChild(dt);
            dl.appendChild(dd);
        });

        $('finishinfo').textContent = S.finishFrom === null
            ? 'not set — the song loops for ever'
            : 'from measure ' + S.finishFrom + ' (' + fmt(S.measures[S.finishFrom].start) + '), then the song ends';
    }

    function renderAll() {
        renderZones();
        renderCheck();
        queueDraw();
    }

    function fmt(t) {
        var m = Math.floor(t / 60), s = t - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    }

    /* --------------------------------------------------------- interaction */

    function measureAt(x) {
        var c = $('wave');
        var w = c.clientWidth;
        var dur = S.buffer.duration;
        var t = Math.max(0, Math.min(1, x / w)) * dur;
        for (var i = 0; i < S.measures.length; i++)
            if (t >= S.measures[i].start && t < S.measures[i].end) return i;
        return S.measures.length - 1;
    }

    var drag = null;

    $('wave').addEventListener('pointerdown', function (ev) {
        if (!S.buffer || !S.measures.length) return;
        var rect = $('wave').getBoundingClientRect();
        var idx = measureAt(ev.clientX - rect.left);
        if (ev.shiftKey && S.sel) {
            S.sel = { a: Math.min(S.sel.a, idx), b: Math.max(S.sel.a, idx) };
            drag = { start: S.sel.a, moved: true };
        } else {
            S.sel = { a: idx, b: idx };
            drag = { start: idx, moved: false, x: ev.clientX };
        }
        queueDraw();
    });

    $('wave').addEventListener('pointermove', function (ev) {
        if (!drag) return;
        var rect = $('wave').getBoundingClientRect();
        var idx = measureAt(ev.clientX - rect.left);
        if (Math.abs(ev.clientX - drag.x) > 3) drag.moved = true;
        S.sel = { a: Math.min(drag.start, idx), b: Math.max(drag.start, idx) };
        queueDraw();
    });

    $('wave').addEventListener('pointerup', function (ev) {
        if (!drag || !S.buffer) { drag = null; return; }
        var rect = $('wave').getBoundingClientRect();
        var idx = measureAt(ev.clientX - rect.left);
        if (!drag.moved) {
            S.roles[idx] = S.roles[idx] === 'side' ? 'normal' : 'side';
            S.sel = null;
            cacheMap();
            renderAll();
        } else {
            S.sel = { a: Math.min(drag.start, idx), b: Math.max(drag.start, idx) };
            queueDraw();
        }
        drag = null;
    });

    $('addzone').onclick = function () {
        if (!S.sel) return;
        var n = nextEventNumber();
        if (n === null) return;
        S.zones.push({ event: n, from: S.sel.a, to: S.sel.b, name: 'zone ' + n });
        S.zones.sort(function (a, b) { return a.from - b.from; });
        S.sel = null;
        cacheMap();
        renderAll();
    };

    $('setfinish').onclick = function () {
        if (!S.sel) return;
        S.finishFrom = S.sel.a;
        cacheMap();
        renderAll();
    };

    function nextEventNumber() {
        var used = {};
        used[E.EVENT.START] = used[E.EVENT.FINISH] = used[E.EVENT.FADE_OUT] = used[E.EVENT.LOAD] = true;
        S.zones.forEach(function (z) { used[z.event] = true; used[z.event + 1] = true; });
        for (var n = 1; n < 60; n++) {
            if (!used[n] && !used[n + 1]) return n;
        }
        return null;
    }

    /* ------------------------------------------------------------ transport */

    function playSlice(offset, duration, when) {
        var src = S.ctx.createBufferSource();
        src.buffer = S.buffer;
        src.connect(S.ctx.destination);
        src.start(when, offset, duration + 0.002);
        src.onended = function () {
            var i = S.sources.indexOf(src);
            if (i >= 0) S.sources.splice(i, 1);
        };
        S.sources.push(src);
    }

    function play() {
        if (!S.buffer) { loadDemo(); }
        ensureCtx().resume();
        if (!S.map) return;
        stop();
        S.player = new E.Player(S.map, { rampSeconds: S.ramp });
        S.player.fire(E.EVENT.START);
        S.playing = true;
        S.t0 = S.ctx.currentTime + 0.06;
        S.nextAt = S.t0;
        S.current = -1;
        S.demo = $('autodemo').checked ? demoSchedule() : [];
        S.timer = setInterval(tick, 25);
        $('play').classList.add('primary');
        frame();
    }

    function stop() {
        if (S.timer) clearInterval(S.timer);
        S.timer = null;
        S.sources.forEach(function (s) { try { s.stop(); } catch (e) { /* already ended */ } });
        S.sources = [];
        S.playing = false;
        S.player = null;
        S.current = -1;
        $('play').classList.remove('primary');
        $('now').textContent = 'stopped';
        queueDraw();
    }

    function demoSchedule() {
        var list = [];
        var z = S.zones[0];
        if (z) {
            list.push({ at: 6, ev: z.event });
            list.push({ at: 16, ev: z.event + 1 });
        }
        if (S.finishFrom !== null) list.push({ at: 26, ev: E.EVENT.FINISH });
        list.push({ at: 34, ev: E.EVENT.FADE_OUT });
        return list;
    }

    function tick() {
        if (!S.playing) return;
        var now = S.ctx.currentTime;
        var elapsed = now - S.t0;

        while (S.demo.length && S.demo[0].at <= elapsed) {
            S.player.fire(S.demo.shift().ev);
        }

        for (var guard = 0; guard < 64 && S.nextAt < now + 0.12; guard++) {
            if (!S.player || S.player.stopped) { stop(); return; }
            var node = S.player.node;
            if (!node) { stop(); return; }
            if (node.kind !== 'audio') { S.player.step(); continue; }
            var m = S.measures[node.measure];
            if (!m) { stop(); return; }
            var dur = m.end - m.start;
            if (dur <= 0.01) { stop(); return; }
            playSlice(m.start, dur, Math.max(now, S.nextAt));
            S.current = node.measure;
            var v = $('autoramp').checked ? S.player.rampValue(S.nextAt + dur - S.t0) : S.player.value;
            S.player.setValue(v);
            S.player.step();
            S.nextAt += dur;
        }
    }

    function frame() {
        if (!S.playing) return;
        var now = S.ctx.currentTime;
        var v = $('autoramp').checked
            ? Math.round(127 * Math.min(1, (now - S.t0) / S.ramp))
            : (S.player ? S.player.value : 0);
        setValueMeter(v);
        var m = S.current >= 0 ? S.measures[S.current] : null;
        $('now').textContent = m
            ? 'measure ' + S.current + '  ·  ' + fmt(m.start) + '  ·  value ' + v + '  ·  '
              + (S.zones.some(function (z) { return S.current >= z.from && S.current <= z.to; }) ? 'in a zone' : 'main chain')
            : 'starting';
        queueDraw();
        requestAnimationFrame(frame);
    }

    function setValueMeter(v) {
        $('valuebar').style.width = Math.max(0, Math.min(100, v / 127 * 100)) + '%';
        $('valuetext').textContent = v;
    }

    function fire(n) {
        if (!S.player) { $('now').textContent = 'press Play first — an event moves the song while it plays'; return; }
        S.player.fire(n);
        $('now').textContent = 'event ' + n + ' sent';
    }

    /* --------------------------------------------------------------- wires */

    $('file').onchange = function (ev) {
        if (ev.target.files[0]) loadFile(ev.target.files[0]);
    };
    $('demo').onclick = function () { loadDemo(); };
    ['bpm', 'beats', 'offset', 'ramp'].forEach(function (id) {
        $(id).onchange = function () { rebuild(); };
        $(id).oninput = function () { rebuild(); };
    });
    ['title', 'artist'].forEach(function (id) {
        $(id).oninput = function () { if (S.map) cacheMap(); };
    });
    $('play').onclick = function () { play(); };
    $('stop').onclick = function () { stop(); };
    Array.prototype.forEach.call(document.querySelectorAll('#eventbtns button[data-ev]'), function (b) {
        b.onclick = function () { fire(parseInt(b.dataset.ev, 10)); };
    });

    $('exportjson').onclick = function () {
        if (!S.map) return;
        download(($('title').value || 'song') + '.json',
            JSON.stringify(E.songFile(arr(), S.map), null, 2), 'application/json');
    };
    $('exportmap').onclick = function () {
        if (!S.map) return;
        download(($('title').value || 'song') + '-map.txt', E.toText(S.map, arr()), 'text/plain');
    };

    function download(name, text, mime) {
        var blob = new Blob([text], { type: mime });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name.replace(/[^\w. -]+/g, '_');
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    window.addEventListener('resize', queueDraw);
    renderAll();
})();
