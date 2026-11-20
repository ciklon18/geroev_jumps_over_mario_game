/* scares.js — внезапные пугающие лица + скример-звук (как в меме Becoming Uncanny).
   Классический скрипт, подключается после becoming.js. Работает и в базовом режиме. */
'use strict';

// The seven jumpscare faces cut straight out of the meme clip.
var FACE_LIST = ['bob', 'glasses', 'stare', 'mouth', 'skull', 'scream', 'void'];
var FACE_IMGS = FACE_LIST.map(function (n) {
  var im = new Image();
  im.src = 'assets/scare/' + n + '.jpg';
  return im;
});
var FACES_FRAMES = FACE_LIST.length;

var SCARE = {
  on: false,        // сейчас на экране
  t: 0,             // таймер показа
  dur: 0,           // сколько будет показано
  face: 0,          // 0..2 какой вариант
  scale: 1,         // зум лица
  shake: 0,
  showLast: 0,      // анти-спам: когда был последний
  chained: 0        // лицо по центру + лицо по краю
};

// ------------------------------------------------------------------ звук
// Три вида скримера, синтезированные на WebAudio (внешний файл не нужен).
// --- sampled sounds: the actual meme clip -----------------------------------
var SAMPLES = {};
['scare_main', 'scare_deep', 'meme_intro', 'meme_full'].forEach(function (k) {
  var a = new Audio('assets/' + k + '.mp3');
  a.preload = 'auto';
  a.volume = k === 'meme_full' ? 0.42 : (k === 'meme_intro' ? 0.55 : 0.95);
  SAMPLES[k] = a;
});

// ------------------------------------------------------------------ фоновая музыка
// Everything the game asks for goes to the real clip; chiptune only if the sample fails.
var BG = { el: null, muted: false, started: false };

function bgStart() {
  var a = SAMPLES.meme_full;
  if (!a) return false;
  try {
    a.loop = true;
    a.volume = BG.muted ? 0 : 0.42;
    var p = a.play();
    if (p && p.catch) {
      // autoplay blocked until a gesture -> retry once on the next tap
      p.catch(function () { BG.started = false; });
      return true;
    }
    BG.started = true;
    return true;
  } catch (e) { return false; }
}

function bgStop() {
  var a = SAMPLES.meme_full;
  if (!a) return;
  try { a.pause(); a.currentTime = 0; } catch (e) {}
  BG.started = false;
}

function bgEnsure() {
  var a = SAMPLES.meme_full;
  if (!a || BG.muted) return;
  if (a.paused) {
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
  }
}

function bgRunning() {
  var a = SAMPLES.meme_full;
  return !!(a && !a.paused && !a.ended);
}

function playSample(kind) {
  bgEnsure();
  var a = SAMPLES[kind === 'deep' ? 'scare_deep' : 'scare_main'];
  if (!a) return false;
  try {
    var c = a.cloneNode();          // overlapping hits: each scare gets its own voice
    c.volume = a.volume;
    var p = c.play();
    if (p && p.catch) p.catch(function () {});
    return true;
  } catch (e) { return false; }
}

function scareSound(kind) {
  // real clip first, synthesized scream only as a fallback
  if (playSample(kind)) return;
  if (typeof SFX === 'undefined' || !SFXOK) return;
  try {
    if (kind === 'deep') SFX.play('screamDeep');
    else if (kind === 'rev') SFX.play('screamRev');
    else SFX.play('scream');
  } catch (e) {}
}

// ------------------------------------------------------------------ вспышка
document.addEventListener('pointerdown', function () {
  for (var k in SAMPLES) { try { SAMPLES[k].load(); } catch (e) {} }
  if (!bgRunning()) bgStart();      // mobile: first tap unlocks the audio
}, { passive: true });
document.addEventListener('keydown', function () {
  if (!bgRunning()) bgStart();
}, { passive: true });

// route every background-music request to the real clip, chiptune is the fallback only
(function () {
  if (typeof SFX === 'undefined' || !SFX.music) return;
  var origMusic = SFX.music;
  SFX.music = function (on) {
    if (on === false) { bgEnsure(); return; }   // "stop music" from the game no longer kills the clip
    bgStart();
  };
  // and: if anything pauses the clip while a run is active, resume it
  setInterval(function () {
    if (typeof G !== 'undefined' && G.mode === 'play' && !BG.muted && SAMPLES.meme_full &&
        SAMPLES.meme_full.paused && SAMPLES.meme_full.currentTime > 0) {
      var p = SAMPLES.meme_full.play();
      if (p && p.catch) p.catch(function () {});
    }
  }, 700);
})();

function triggerScare(power) {
  var now = G.t;
  if (now - SCARE.showLast < 1.5) return;          // не спамим чаще 1.5 с
  SCARE.showLast = now;
  SCARE.on = true;
  SCARE.t = 0;
  SCARE.dur = 0.32 + Math.random() * 0.28;
  SCARE.face = (Math.random() * FACE_LIST.length) | 0;
  SCARE.scale = 0.95 + power * 0.9;
  SCARE.shake = 18 + power * 22;
  G.shake = Math.max(G.shake, SCARE.shake * 0.6);
  scareSound(power > 0.8 ? 'deep' : power > 0.45 ? 'rev' : 'scream');
}

// ------------------------------------------------------------------ логика
function updateScare(dt) {
  if (!SCARE.on) return;
  SCARE.t += dt;
  if (SCARE.t >= SCARE.dur) SCARE.on = false;
}

// выбирает момент для следующего скримера: чем выше стадия — тем чаще
function scheduleScare(dt) {
  if (G.mode !== 'play') return;
  SCARE.cool = (SCARE.cool || 0) - dt;
  var stage = (typeof UNC !== 'undefined') ? UNC.stage : 0;
  var started = (typeof UNC !== 'undefined') ? UNC.started : true;
  if (!started) return;
  var chance = (0.25 + stage * 0.35) * dt;   // стадия 1 → ~0.6 вспышки в секунду
  if (SCARE.cool <= 0 && Math.random() < chance) {
    triggerScare(Math.min(1, stage / 6));
    SCARE.cool = Math.max(1.2, 4.5 - stage * 0.5);   // пауза между вспышками
  }
}

// ------------------------------------------------------------------ отрисовка
function playIntroSample() {
  try {
    var c = SAMPLES.meme_intro.cloneNode();
    c.volume = 0.5;
    var p = c.play();
    if (p && p.catch) p.catch(function () {});
  } catch (e) {}
}

function drawScare(c) {
  if (!SCARE.on) return;
  var W = CV.width, H = CV.height;
  var p = SCARE.t / SCARE.dur;
  // рванный показ: 1-2 кадра задержки — «дергается», как в меме
  var reduce = (typeof REDUCED !== 'undefined' && REDUCED);
  var flicker = (!reduce && (Math.floor(SCARE.t * 26) % 5 === 0)) ? 0.45 : 1;
  c.save();
  c.globalAlpha = flicker;
  var sx = SCARE.scale + Math.sin(SCARE.t * 40) * 0.04;
  var sw = Math.min(W * 0.62, H * 0.95) * sx, sh = sw * 1.1;
  var shakeOn = !(typeof REDUCED !== 'undefined' && REDUCED);
  var cx = W / 2 + (shakeOn ? Math.sin(SCARE.t * 90) * 14 : 0);
  var cy = H / 2 + (shakeOn ? Math.cos(SCARE.t * 70) * 10 : 0);
  var img = FACE_IMGS[SCARE.face % FACE_IMGS.length];
  if (img && img.complete && img.naturalWidth) {
    c.drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh);
  } else {
    // фолбэк, пока картинка не загрузилась: зловещий овал
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(cx - sw * 0.15, cy - sh * 0.12, sw * 0.07, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + sw * 0.15, cy - sh * 0.12, sw * 0.07, 0, Math.PI * 2); c.fill();
  }
  // красноватый ореол по краям поверх лица
  var g = c.createRadialGradient(cx, cy, Math.min(sw, sh) * 0.25, cx, cy, Math.max(sw, sh) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(70,0,0,0.45)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.restore();
}

// ------------------------------------------------------------------ хук в draw()
(function () {
  var _draw = draw;
  draw = function () {
    _draw();
    CTX.setTransform(1, 0, 0, 1, 0, 0);
    drawScare(CTX);
    CTX.setTransform(1, 0, 0, 1, 0, 0);
  };
})();

// ------------------------------------------------------------------ хук в update()
(function () {
  var _upd = update;
  update = function (dt) {
    _upd(dt);
    updateScare(dt);
    scheduleScare(dt);
  };
})();

// гарантированный скример на старте режима Becoming (через 10 с)
(function () {
  if (typeof startBecoming !== 'function') return;
  var _start = startBecoming;
  startBecoming = function () {
    _start();
    SCARE.showLast = -99;
    SCARE.cool = 10;
  };
})();