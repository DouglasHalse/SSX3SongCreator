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
        audioLive: false,
        t0: 0,
        nextAt: 0,
        sources: [],
        current: -1,
        demo: [],
        drawQueued: false,
        playhead: 0,
        selZone: null,
        scrubbing: false,
        lastScrub: 0
    };

    /* the top strip of the canvas is the ruler: drag it to scrub, the body below
     * it is for marking sections */
    var RULER_H = 20;

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

    function note(text) { $('tempo').textContent = text; }

    function detectTempo() {
        if (!S.buffer) return null;
        var chans = [];
        try {
            for (var c = 0; c < Math.min(2, S.buffer.numberOfChannels); c++)
                chans.push(S.buffer.getChannelData(c));
            return E.detectTempo(chans, S.buffer.sampleRate);
        } catch (err) {
            return null;
        }
    }

    function setAudio(buffer, name) {
        S.buffer = buffer;
        S.name = name;
        S.peaks = peaksOf(buffer);
        $('srcname').textContent = name + '  (' + buffer.duration.toFixed(1) + ' s, ' +
            buffer.numberOfChannels + ' ch, ' + buffer.sampleRate + ' Hz)';
        stop();
        var det = detectTempo();
        if (det && det.confidence >= 0.15) {
            $('bpm').value = det.bpm.toFixed(2);
            $('offset').value = det.offset.toFixed(3);
            note('detected ' + det.bpm.toFixed(1) + ' BPM (' + Math.round(det.confidence * 100) +
                '%) — ×2 / ÷2 if that is half or double');
        } else {
            note('no tempo in this audio — set BPM by hand');
        }
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
    function indexAt(t) {
        for (var i = 0; i < S.measures.length; i++)
            if (t >= S.measures[i].start && t < S.measures[i].end) return i;
        return -1;
    }

    /* Re-cut the audio for new tempo settings. Markings are carried over by the
     * time they sit at, so changing BPM (or its octave) keeps them on the same
     * music instead of on the same bar number. */
    function rebuild() {
        var sides = [], zones = [], finishAt = null, i;
        for (i = 0; i < S.roles.length; i++)
            if (S.roles[i] === 'side' && S.measures[i]) sides.push(S.measures[i].start);
        S.zones.forEach(function (z) {
            if (!S.measures[z.from] || !S.measures[z.to]) return;
            zones.push({ event: z.event, from: S.measures[z.from].start, to: S.measures[z.to].end, name: z.name });
        });
        if (S.finishFrom !== null && S.measures[S.finishFrom]) finishAt = S.measures[S.finishFrom].start;

        readInputs();
        var dur = S.buffer ? S.buffer.duration : 0;
        S.measures = dur > 0 ? E.measures({ bpm: S.bpm, beatsPerMeasure: S.beats, duration: dur, offset: S.offset }) : [];

        S.roles = S.measures.map(function () { return 'normal'; });
        sides.forEach(function (t) {
            var at = indexAt(t);
            if (at >= 0) S.roles[at] = 'side';
        });

        S.zones = zones.map(function (z) {
            return { event: z.event, from: indexAt(z.from), to: indexAt(z.to - 1e-6), name: z.name };
        }).filter(function (z) { return z.from >= 0 && z.to >= z.from; });

        S.finishFrom = (finishAt !== null && indexAt(finishAt) >= 0) ? indexAt(finishAt) : null;
        S.sel = null;
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
        var waveH = h - RULER_H;
        var mid = RULER_H + waveH * 0.46;
        var amp = waveH * 0.46 * 0.92;

        /* waveform */
        g.fillStyle = '#243040';
        var n = S.peaks.length / 2;
        for (var i = 0; i < n; i++) {
            var x = (i / n) * w;
            var lo = S.peaks[i * 2], hi = S.peaks[i * 2 + 1];
            g.fillRect(x, mid - hi * amp, Math.max(1, w / n), Math.max(1, (hi - lo) * amp));
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

        /* the measure being played */
        if (S.current >= 0 && S.measures[S.current] && S.playing) {
            var m = S.measures[S.current];
            g.fillStyle = 'rgba(111,179,255,.18)';
            g.fillRect(xOf(m.start), 0, xOf(m.end) - xOf(m.start), h);
        }

        /* ruler, drawn last so it stays legible over the waveform */
        g.fillStyle = '#0b0f14';
        g.fillRect(0, 0, w, RULER_H);
        g.strokeStyle = '#2b323d';
        g.beginPath();
        g.moveTo(0, RULER_H + 0.5);
        g.lineTo(w, RULER_H + 0.5);
        g.stroke();
        g.fillStyle = '#6b7787';
        g.font = '10px ui-monospace, monospace';
        var stepSec = dur > 150 ? 30 : dur > 60 ? 10 : 5;
        for (var ts = 0; ts <= dur; ts += stepSec) {
            var tx = xOf(ts);
            g.fillRect(tx, RULER_H - 5, 1, 5);
            g.fillText(fmt(ts), Math.min(tx + 3, w - 34), 11);
        }

        /* playhead */
        var ph = playbackPos();
        var px = xOf(Math.min(Math.max(0, ph), dur));
        g.strokeStyle = S.playing ? '#ffffff' : '#8fa6bf';
        g.beginPath();
        g.moveTo(px, 0);
        g.lineTo(px, h);
        g.stroke();
        g.fillStyle = g.strokeStyle;
        g.beginPath();
        g.moveTo(px - 4, 0);
        g.lineTo(px + 4, 0);
        g.lineTo(px, 7);
        g.fill();
    }

    /* ------------------------------------------------------------ the rest */

    function renderZones() {
        var ul = $('zones');
        ul.innerHTML = '';
        if (!S.zones.length) {
            var li = document.createElement('li');
            li.innerHTML = '<span class="muted">none yet — drag across bars, then pick “course zone”</span>';
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
        renderSel();
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

    function zoneAt(idx) {
        for (var i = 0; i < S.zones.length; i++)
            if (idx >= S.zones[i].from && idx <= S.zones[i].to) return i;
        return -1;
    }

    var drag = null;

    $('wave').addEventListener('pointerdown', function (ev) {
        if (!S.buffer || !S.measures.length) return;
        var rect = $('wave').getBoundingClientRect();
        var x = ev.clientX - rect.left;

        if (ev.clientY - rect.top <= RULER_H) {
            S.scrubbing = true;
            try { $('wave').setPointerCapture(ev.pointerId); } catch (e) { /* no capture */ }
            stop();
            scrubTo((x / rect.width) * S.buffer.duration);
            return;
        }

        var idx = measureAt(x);
        var zi = zoneAt(idx);
        if (zi >= 0 && !ev.shiftKey) {
            S.sel = { a: S.zones[zi].from, b: S.zones[zi].to };
            S.selZone = zi;
            drag = { start: S.sel.a, moved: true, x: ev.clientX };
        } else if (ev.shiftKey && S.sel) {
            S.sel = { a: Math.min(S.sel.a, idx), b: Math.max(S.sel.a, idx) };
            drag = { start: S.sel.a, moved: true, x: ev.clientX };
        } else {
            S.sel = { a: idx, b: idx };
            S.selZone = null;
            drag = { start: idx, moved: false, x: ev.clientX };
        }
        renderSel();
        queueDraw();
    });

    $('wave').addEventListener('pointermove', function (ev) {
        var rect = $('wave').getBoundingClientRect();
        var x = ev.clientX - rect.left;
        if (S.scrubbing) {
            scrubTo((x / rect.width) * S.buffer.duration);
            return;
        }
        $('wave').style.cursor = (ev.clientY - rect.top <= RULER_H) ? 'ew-resize' : 'default';
        if (!drag || !S.buffer) return;
        var idx = measureAt(x);
        if (Math.abs(ev.clientX - drag.x) > 3) drag.moved = true;
        S.sel = { a: Math.min(drag.start, idx), b: Math.max(drag.start, idx) };
        S.selZone = null;
        renderSel();
        queueDraw();
    });

    $('wave').addEventListener('pointerup', function (ev) {
        if (S.scrubbing) {
            S.scrubbing = false;
            try { $('wave').releasePointerCapture(ev.pointerId); } catch (e) { /* not captured */ }
            return;
        }
        if (!drag || !S.buffer) { drag = null; return; }
        var rect = $('wave').getBoundingClientRect();
        var idx = measureAt(ev.clientX - rect.left);
        if (!drag.moved) {
            S.roles[idx] = S.roles[idx] === 'side' ? 'normal' : 'side';
            S.sel = null;
            S.selZone = null;
            cacheMap();
            renderAll();
        } else {
            S.sel = { a: Math.min(drag.start, idx), b: Math.max(drag.start, idx) };
            renderSel();
            queueDraw();
        }
        drag = null;
    });

    /* The chips under a selection: whatever the range is now, make it this. */
    function applyType(kind) {
        if (!S.sel || !S.measures.length) return;
        var a = S.sel.a, b = S.sel.b, i;
        var keepEvent = (S.selZone !== null && S.zones[S.selZone]) ? S.zones[S.selZone].event : null;

        for (i = a; i <= b; i++) if (S.roles[i]) S.roles[i] = 'normal';
        S.zones = S.zones.filter(function (z) { return z.to < a || z.from > b; });
        if (S.finishFrom !== null && S.finishFrom >= a && S.finishFrom <= b) S.finishFrom = null;

        if (kind === 'side') {
            for (i = a; i <= b; i++) S.roles[i] = 'side';
        } else if (kind === 'zone') {
            var n = keepEvent !== null ? keepEvent : nextEventNumber();
            if (n === null) return;
            S.zones.push({ event: n, from: a, to: b, name: 'zone ' + n });
            S.zones.sort(function (x, y) { return x.from - y.from; });
        } else if (kind === 'finish') {
            S.finishFrom = a;
        }

        S.sel = null;
        S.selZone = null;
        cacheMap();
        renderAll();
    }

    Array.prototype.forEach.call(document.querySelectorAll('#selbar button[data-type]'), function (b) {
        b.onclick = function () { applyType(b.dataset.type); };
    });

    /* Keeps the chips against the selection they act on, and marks which type
     * the range already has. */
    function renderSel() {
        var bar = $('selbar');
        if (!S.sel || !S.measures.length || !S.buffer) { bar.hidden = true; return; }
        var a = S.measures[S.sel.a], b = S.measures[S.sel.b];
        var box = $('wavebox').getBoundingClientRect();
        var c = $('wave').getBoundingClientRect();
        if (!a || !b) { bar.hidden = true; return; }

        bar.hidden = false;
        var x0 = (c.left - box.left) + (a.start / S.buffer.duration) * c.width;
        var x1 = (c.left - box.left) + (b.end / S.buffer.duration) * c.width;
        var want = (x0 + x1) / 2 - bar.offsetWidth / 2;
        bar.style.left = Math.max(6, Math.min(box.width - bar.offsetWidth - 6, want)) + 'px';

        var kind = S.selZone !== null ? 'zone' : null;
        if (!kind) {
            for (var i = S.sel.a; i <= S.sel.b; i++) if (S.roles[i] === 'side') { kind = 'side'; break; }
        }
        if (!kind && S.finishFrom !== null && S.finishFrom >= S.sel.a && S.finishFrom <= S.sel.b) kind = 'finish';
        Array.prototype.forEach.call(bar.querySelectorAll('button[data-type]'), function (btn) {
            btn.classList.toggle('on', btn.dataset.type === kind);
        });
    }

    /* Scrubbing: short bursts of the file at the playhead, because the thing you
     * are listening for is the beat, not the arrangement. */
    function scrubTo(t) {
        if (!S.buffer) return;
        S.playhead = Math.max(0, Math.min(S.buffer.duration, t));
        queueDraw();
        if (!S.audioLive || !S.ctx) return;
        var now = S.ctx.currentTime;
        if (now - S.lastScrub < 0.07) return;
        S.lastScrub = now;
        audition();
    }

    function audition() {
        var src = S.ctx.createBufferSource();
        src.buffer = S.buffer;
        var gain = S.ctx.createGain();
        gain.gain.value = 0.85;
        src.connect(gain);
        gain.connect(S.ctx.destination);
        src.start(0, S.playhead, 0.14);
        src.onended = function () {
            try { src.disconnect(); gain.disconnect(); } catch (e) { /* gone */ }
        };
    }

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

    function clock() {
        return S.audioLive ? S.ctx.currentTime : performance.now() / 1000;
    }

    /* Where the playhead is: the arrangement while it plays, otherwise wherever
     * the last scrub left it. */
    function playbackPos() {
        if (!S.playing) return S.playhead;
        var t = clock() - S.t0;
        if (t >= 0) S.playhead = Math.min(t, S.buffer ? S.buffer.duration : t);
        return S.playhead;
    }

    function playSlice(offset, duration, when) {
        if (!S.audioLive) return;
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

    /* A suspended context freezes its clock -- and resume() can stay pending for
     * ever when nothing can start the device -- so the preview runs on the wall
     * clock and moves onto the audio clock once that comes up, keeping its place. */
    function adoptAudioClock() {
        if (S.audioLive || !S.ctx || S.ctx.state !== 'running') return;
        var elapsed = clock() - S.t0;
        var next = S.nextAt - S.t0;
        S.audioLive = true;
        S.t0 = S.ctx.currentTime - elapsed;
        S.nextAt = S.t0 + next;
    }

    function play() {
        if (!S.buffer) { loadDemo(); }
        if (!S.map) return;
        var ctx = ensureCtx();
        ctx.resume();
        stop();
        S.audioLive = ctx.state === 'running';
        S.player = new E.Player(S.map, { rampSeconds: S.ramp });
        S.player.fire(E.EVENT.START);
        S.playing = true;
        S.t0 = clock() + 0.06;
        S.nextAt = S.t0;
        S.current = -1;
        S.playhead = 0;
        S.sel = null;
        S.selZone = null;
        renderSel();
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
        S.audioLive = false;
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
        adoptAudioClock();
        var now = clock();
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
        updateReadout();
    }

    /* The readout follows the scheduler, not the animation frame: a throttled
     * frame loop would otherwise leave the value stuck while the song plays on. */
    function updateReadout() {
        var v = $('autoramp').checked
            ? Math.round(127 * Math.min(1, (clock() - S.t0) / S.ramp))
            : (S.player ? S.player.value : 0);
        setValueMeter(v);
        var m = S.current >= 0 ? S.measures[S.current] : null;
        $('now').textContent = m
            ? (S.audioLive ? '' : 'silent preview  ·  ') + 'measure ' + S.current + '  ·  ' + fmt(m.start)
              + '  ·  value ' + v + '  ·  '
              + (S.zones.some(function (z) { return S.current >= z.from && S.current <= z.to; }) ? 'in a zone' : 'main chain')
            : 'starting';
    }

    function frame() {
        if (!S.playing) return;
        updateReadout();
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
        $(id).onchange = function () { if (id !== 'beats' && id !== 'ramp') note(''); rebuild(); };
        $(id).oninput = function () { if (id !== 'beats' && id !== 'ramp') note(''); rebuild(); };
    });
    ['title', 'artist'].forEach(function (id) {
        $(id).oninput = function () { if (S.map) cacheMap(); };
    });
    $('twice').onclick = function () {
        $('bpm').value = (num('bpm', 92) * 2).toFixed(2);
        note('octave changed — the markings stayed on the same music, not the same bar number');
        rebuild();
    };
    $('half').onclick = function () {
        $('bpm').value = (num('bpm', 92) / 2).toFixed(2);
        note('octave changed — the markings stayed on the same music, not the same bar number');
        rebuild();
    };
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

    /* Open the page with #debug to reach the state from the console. */
    if (location.hash === '#debug') window.__song = S;
})();
