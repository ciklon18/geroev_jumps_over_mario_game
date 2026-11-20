/* sfx.js — tiny 8-bit WebAudio sound effects + music loop. Classic script, no assets. */
(function (global) {
  'use strict';

  var AC = global.AudioContext || global.webkitAudioContext || null;
  var ctx = null, master = null, isMuted = false;
  var noiseBuf = null;

  function now() { return ctx ? ctx.currentTime : 0; }

  // Lazily build the audio graph; returns false if WebAudio is unavailable.
  function ensure() {
    if (!AC) return false;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = isMuted ? 0 : 1;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; master = null; return false; }
    }
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    return true;
  }

  // One enveloped oscillator note.
  // o: {f0,f1,type,t0,dur,vol,attack,hold}
  function tone(o) {
    if (!ctx) return;
    var t0 = now() + (o.t0 || 0);
    var dur = o.dur || 0.1;
    var vol = o.vol == null ? 0.25 : o.vol;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0 || 440, t0);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);

    var atk = o.attack == null ? 0.005 : o.attack;
    var sus = o.hold == null ? 0.0 : o.hold; // flat portion before the decay tail
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    if (sus > 0) g.gain.setValueAtTime(vol, t0 + Math.min(dur, atk + sus));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g); g.connect(o.dest || master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
    osc.onended = function () { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  }

  // White-noise buffer, created once and reused (for swooshes).
  function noise() {
    if (!ctx) return null;
    if (!noiseBuf) {
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Filtered noise burst sweeping downward, plus optional saw layer.
  function swoosh(t0, dur, from, to, vol) {
    if (!ctx) return;
    var t = now() + t0;
    var src = ctx.createBufferSource(); src.buffer = noise();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
    src.onended = function () { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch (e) {} };
    tone({ t0: t0, f0: from / 6, f1: to / 12, type: 'sawtooth', dur: dur, vol: vol * 0.35 });
  }

  var sounds = {
    // Mario-style rising blip
    jump: function () { tone({ f0: 330, f1: 880, type: 'square', dur: 0.16, vol: 0.22 }); },
    // Squash: quick low thud + click
    stomp: function () {
      tone({ f0: 520, f1: 70, type: 'square', dur: 0.12, vol: 0.28 });
      tone({ t0: 0.02, f0: 900, f1: 120, type: 'triangle', dur: 0.08, vol: 0.18 });
    },
    // Game over: descending sad tone
    squash: function () {
      var s = [523, 415, 330, 196];
      for (var i = 0; i < s.length; i++) {
        tone({ t0: i * 0.16, f0: s[i], f1: s[i] * 0.98, type: 'square', dur: i === 3 ? 0.42 : 0.15, vol: 0.20, hold: 0.06 });
      }
    },
    // Two quick coin blips
    coin: function () {
      tone({ f0: 988, type: 'square', dur: 0.07, vol: 0.22 });
      tone({ t0: 0.08, f0: 1319, type: 'square', dur: 0.12, vol: 0.22 });
    },
    // Fast downward saw + noise swoosh
    dash: function () {
      tone({ f0: 1200, f1: 220, type: 'sawtooth', dur: 0.16, vol: 0.16 });
      swoosh(0, 0.18, 2600, 600, 0.12);
    },
    // Bright arpeggio
    power: function () {
      var a = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < a.length; i++) tone({ t0: i * 0.055, f0: a[i], type: 'square', dur: 0.14, vol: 0.18 });
    },
    // Missed / flew over: long whoosh down
    whiff: function () {
      swoosh(0, 0.34, 2200, 180, 0.16);
      tone({ f0: 760, f1: 140, type: 'triangle', dur: 0.32, vol: 0.12 });
    },
    // Sarcastic tick
    feint: function () {
      tone({ f0: 1400, type: 'square', dur: 0.035, vol: 0.16 });
      tone({ t0: 0.06, f0: 1050, type: 'square', dur: 0.035, vol: 0.12 });
    },
    // JUMPSCARE: a full horror scream (noise + detuned saws sliding down)
    scream: function () {
      swoosh(0, 0.55, 5200, 240, 0.30);
      slide(720, 180, 0, 0.5, 'sawtooth', 0.14);
      slide(760, 150, 0.01, 0.5, 'square', 0.08);
      tone({ t0: 0.02, f0: 1100, f1: 220, type: 'sawtooth', dur: 0.45, vol: 0.10 });
    },
    // harder variant used at high stages
    screamDeep: function () {
      swoosh(0, 0.8, 3000, 90, 0.32);
      slide(240, 55, 0, 0.75, 'sawtooth', 0.16);
      tone({ t0: 0.03, f0: 90, f1: 42, type: 'square', dur: 0.7, vol: 0.10 });
      tone({ t0: 0.08, f0: 880, f1: 160, type: 'sawtooth', dur: 0.5, vol: 0.07 });
    },
    // reversed-sounding scream (rises instead of falling)
    screamRev: function () {
      slide(120, 1400, 0, 0.4, 'sawtooth', 0.13);
      swoosh(0, 0.42, 200, 5200, 0.22);
      tone({ t0: 0.15, f0: 300, f1: 1500, type: 'square', dur: 0.25, vol: 0.07 });
    },
    // the world turns dark: a dissonant swell
    stinger: function () {
      slide(90, 42, 0, 0.9, 'sawtooth', 0.10);
      tone({ t0: 0.05, f0: 311, f1: 294, type: 'square', dur: 0.8, vol: 0.05 });
      tone({ t0: 0.10, f0: 233, f1: 220, type: 'square', dur: 0.8, vol: 0.05 });
      swoosh(0, 0.7, 300, 60, 0.12);
    },
    select: function () { tone({ f0: 660, type: 'square', dur: 0.05, vol: 0.18 }); },
    // hard cut: vinyl stop before a stage change
    cut: function () {
      slide(600, 60, 0, 0.09, 'sawtooth', 0.08);
      swoosh(0, 0.12, 4000, 200, 0.07);
    },
    // rollback to Canny
    canny: function () {
      tone({ f0: 523, type: 'square', dur: 0.07, vol: 0.18 });
      tone({ t0: 0.08, f0: 784, type: 'square', dur: 0.07, vol: 0.18 });
      tone({ t0: 0.16, f0: 1047, type: 'square', dur: 0.16, vol: 0.16 });
    },
    // Mario jumps (rising arcade blip)
    mjump: function () { tone({ f0: 220, f1: 660, type: 'square', dur: 0.13, vol: 0.16 }); },
    // Mario lands (soft thud)
    ml: function () {
      tone({ f0: 180, f1: 90, type: 'triangle', dur: 0.09, vol: 0.16 });
      swoosh(0, 0.1, 900, 300, 0.05);
    },
    // mushroom dives under its own cap
    shield: function () {
      tone({ f0: 520, f1: 260, type: 'triangle', dur: 0.14, vol: 0.16 });
      tone({ t0: 0.08, f0: 880, type: 'triangle', dur: 0.18, vol: 0.10 });
    },
    start: function () {
      tone({ f0: 523, type: 'square', dur: 0.08, vol: 0.20 });
      tone({ t0: 0.09, f0: 784, type: 'square', dur: 0.09, vol: 0.20 });
      tone({ t0: 0.19, f0: 1047, type: 'square', dur: 0.18, vol: 0.20 });
    }
  };

  // ---- Music: stage-based memey soundtrack (original chiptune approximations)
  // keys: canny1 canny2 unc1 unc2 unc3 unc4
  var musicOn = false, timer = null, step = 0, nextTime = 0, curTrack = null;
  var LOOKAHEAD = 0.12, TICK = 25;

  function n(f, t0, dur, type, vol) { tone({ t0: t0, f0: f, type: type || 'square', dur: dur, vol: vol == null ? 0.05 : vol }); }
  function slide(f0, f1, t0, dur, type, vol) { tone({ t0: t0, f0: f0, f1: f1, type: type || 'sawtooth', dur: dur, vol: vol == null ? 0.06 : vol }); }

  // each track = fn(step 0..7, start offset)
  var TRACKS = {
    canny1: { step: 0.16, fn: function (i, t0) {
      var mel = [784, 880, 988, 1047, 988, 880, 784, 659];
      n(131, t0, 0.15, 'triangle', 0.045); n(mel[i], t0, 0.12, 'square', 0.03);
      if (i % 4 === 0) n(mel[i] * 2, t0, 0.08, 'sine', 0.015); } },
    canny2: { step: 0.155, fn: function (i, t0) {
      var mel = [659, 784, 880, 784, 659, 587, 523, 659];
      n(131, t0, 0.14, 'triangle', 0.05); n(mel[i], t0, 0.11, 'square', 0.03); } },
    unc1: { step: 0.19, fn: function (i, t0) {
      var mel = [392, 415, 392, 370, 349, 330, 311, 294];
      var bass = [98, 98, 87, 87, 82, 82, 73, 73];
      n(bass[i], t0, 0.18, 'triangle', 0.055);
      if (i % 2 === 0) n(mel[i], t0, 0.14, 'square', 0.022);
      if (i === 7) slide(300, 180, t0, 0.25, 'sine', 0.02); } },
    unc2: { step: 0.21, fn: function (i, t0) {
      var mel = [311, 294, 277, 262, 247, 233, 220, 208];
      n(73, t0, 0.2, 'triangle', 0.06);
      if (i % 2 === 0) n(mel[i], t0, 0.18, 'sawtooth', 0.018);
      if (i === 0) n(116, t0, 0.06, 'square', 0.04); } },
    unc3: { step: 0.14, fn: function (i, t0) {
      slide(196, 98, t0, 0.13, 'sawtooth', 0.055);
      if (i % 2 === 0) n(49, t0, 0.12, 'square', 0.05);
      if (i % 4 === 2) slide(400, 120, t0, 0.1, 'square', 0.03); } },
    unc4: { step: 0.13, fn: function (i, t0) {
      slide(230, 80, t0, 0.12, 'sawtooth', 0.06);
      n(41, t0, 0.1, 'square', 0.055);
      if (i === 0) n(880, t0, 0.05, 'square', 0.03);
      if (i === 5) slide(900, 200, t0, 0.06, 'square', 0.03); } }
  };

  function schedule() {
    if (ctx && nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;   // no burst after a hidden tab
    var tr = TRACKS[curTrack];
    if (!ctx || !musicOn || !tr) return;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      var d = Math.max(0, nextTime - ctx.currentTime);
      tr.fn(step % 8, d);
      nextTime += tr.step;
      step++;
    }
  }

  // music(true) = default loop, music(false) = off, music('unc2') = switch stage track
  function music(on) {
    var key = on === true ? 'canny1' : (on ? String(on) : null);
    if (key && key === curTrack) { ensure(); return; }
    curTrack = key;
    musicOn = !!key;
    if (!key) {
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }
    if (!TRACKS[key]) { curTrack = 'canny1'; key = curTrack; }
    if (!ensure()) return;
    step = 0; nextTime = ctx.currentTime + 0.05;
    schedule();
    if (!timer) timer = setInterval(schedule, TICK);
  }

  var SFX = {
    unlock: function () {
      if (!ensure()) return;
      schedule(); // nudge the scheduler if music is running
    },
    play: function (name) {
      if (isMuted || !sounds[name] || !ensure()) return;
      try { sounds[name](); } catch (e) {}
    },
    music: music
  };

  try {
    Object.defineProperty(SFX, 'muted', {
      get: function () { return isMuted; },
      set: function (v) {
        isMuted = !!v;
        if (master) master.gain.value = isMuted ? 0 : 1;
      },
      configurable: true
    });
    Object.defineProperty(SFX, 'ready', { get: function () { return !!ctx; } });
  } catch (e) {
    SFX.muted = false; // very old engines: fall back to a plain property
  }

  global.SFX = SFX;
})(typeof window !== 'undefined' ? window : this);