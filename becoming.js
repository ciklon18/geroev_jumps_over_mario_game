/* becoming.js — режим «Бесконечный Becoming»: шкала Uncanny, Боб Парр,
   мем-музыка стадиями и визуальный распад экрана.
   Классический скрипт, подключается после game.js. Depends on: SFX, HERO, P, M, G. */
'use strict';

var MODE = { mode: 'base', storyEnd: false };   // base | becoming
var UNC = { v: 0, stage: 0, peak: 0, memory: 0, hud: 0, lastHit: 0, streak: 0, sinceCanny: 0, flash: 0, hint: 0, started: false, floor: 0 };
var BOB = { on: false, x: 0, y: 0, state: 'hidden', t: 0, alpha: 0, grab: 0, face: 0, shootCD: 3 };
var STAGES = 7;
var BECOMING_DELAY = 10;   // seconds of play before Bob, the music and the horror start
var STAGE_TRACK = ['canny1', 'canny2', 'unc1', 'unc2', 'unc3', 'unc4', 'unc4'];
var STAGE_NAME = ['ТЫ В ПОРЯДКЕ', 'ВСЁ ХОРОШО', 'ЧТО-ТО НЕ ТАК', 'ПОГЛУБЖЕ', 'ОН ВИДИТ ТЕБЯ', 'ЭТО НЕ ПАПА', 'БЕГИ ПРОСТО БЕГИ'];

// ------------------------------------------------------------------ Боб (рисуем кодом)
function drawBob(c, x, y, s, mood) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  var t = G.t;
  // ноги
  c.fillStyle = '#2b3a8c';
  c.fillRect(-12, -26, 10, 26);
  c.fillRect(3, -26, 10, 26);
  c.fillStyle = '#3a2a1a';
  c.fillRect(-14, -4, 14, 5);
  c.fillRect(2, -4, 14, 5);
  // шорты
  c.fillStyle = '#3a6fd0';
  roundRectPath(c, -17, -50, 34, 26, 6); c.fill();
  // торс — красный костюм
  c.fillStyle = '#c62b2b';
  roundRectPath(c, -22, -92, 44, 48, 12); c.fill();
  // эмблема i
  c.fillStyle = '#2b2b3a';
  c.beginPath(); c.arc(0, -72, 10, 0, TAU); c.fill();
  c.fillStyle = '#fff';
  c.fillRect(-2, -79, 4, 12);
  c.fillRect(-4, -66, 8, 3);
  // руки
  c.fillStyle = '#c62b2b';
  var sw = Math.sin(t * 9) * 6;
  roundRectPath(c, -36, -90 + sw, 16, 40, 8); c.fill();
  roundRectPath(c, 20, -90 - sw, 16, 40, 8); c.fill();
  c.fillStyle = '#f0c9a0';
  c.beginPath(); c.arc(-28, -50 + sw, 9, 0, TAU); c.fill();
  c.beginPath(); c.arc(28, -50 - sw, 9, 0, TAU); c.fill();
  // шея и голова
  c.fillStyle = '#f0c9a0';
  c.fillRect(-6, -98, 12, 10);
  c.beginPath(); c.arc(0, -118, 24, 0, TAU); c.fill();
  // волосы
  c.fillStyle = mood >= 4 ? '#6b4a2a' : '#8a5a30';
  c.beginPath(); c.arc(0, -124, 24, Math.PI * 1.02, Math.PI * 1.98); c.fill();
  // глаза — чем выше стадия, тем меньше зрачок и злее брови
  var eyeR = 5.5, pupil = mood >= 4 ? 1.8 : mood >= 2 ? 2.8 : 3.6;
  c.fillStyle = '#fff';
  c.beginPath(); c.ellipse(-9, -120, eyeR, eyeR * 0.9, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(9, -120, eyeR, eyeR * 0.9, 0, 0, TAU); c.fill();
  c.fillStyle = mood >= 4 ? '#8a1010' : '#1b1b26';
  c.beginPath(); c.arc(-9 + (mood >= 4 ? Math.sin(t * 20) * 1.5 : 0), -120, pupil, 0, TAU); c.fill();
  c.beginPath(); c.arc(9 + (mood >= 4 ? Math.sin(t * 20) * 1.5 : 0), -120, pupil, 0, TAU); c.fill();
  // брови
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-15, -127 + mood); c.lineTo(-4, -125 - mood); c.stroke();
  c.beginPath(); c.moveTo(15, -127 + mood); c.lineTo(4, -125 - mood); c.stroke();
  // рот
  c.strokeStyle = '#7a3a2a'; c.lineWidth = 2.5;
  c.beginPath();
  if (mood >= 3) c.arc(0, -106, 8, 0, Math.PI);   // злой оскал
  else c.arc(0, -108, 7, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
  // маска в стиле супергероя на высоких стадиях
  if (mood >= 5) {
    c.fillStyle = 'rgba(15,15,25,0.85)';
    c.beginPath(); c.ellipse(-9, -120, 7, 7, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(9, -120, 7, 7, 0, 0, TAU); c.fill();
    c.fillStyle = '#ff2b2b';
    c.beginPath(); c.arc(-9, -120, 2.4, 0, TAU); c.fill();
    c.beginPath(); c.arc(9, -120, 2.4, 0, TAU); c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ шкала
function uncannyAdd(d) {
  UNC.v = clamp(UNC.v + d, 0, 100);
  if (UNC.v > UNC.peak) UNC.peak = UNC.v;
  var target = Math.min(STAGES - 1, Math.floor(UNC.v / (100 / (STAGES - 1)) + 0.0001));
  target = Math.min(target, UNC.memory);
  if (UNC.started && target < UNC.floor) target = UNC.floor;   // the timer sets a floor
  if (d < 0) UNC.streak = 0;
  if (!UNC.started) target = 0;   // nothing scary before the 10-second mark
  while (UNC.stage < target) { UNC.stage++; stageUp(); }
  while (UNC.stage > target) { UNC.stage--; SFX.play('canny'); UNC.flash = 1; G.score += 20; popup(P.x, P.y - HH() - 20, 'CANNY +20', '#9fe8ff'); }
}
function stageUp() {
  UNC.lastHit = 1.4;
  UNC.sinceCanny = 0;
  SFX.play('cut');
  SFX.music(STAGE_TRACK[Math.max(0, UNC.stage - 1)]);
  G.shake = Math.max(G.shake, 6 + UNC.stage * 3);
  if (UNC.stage === 4 && !MODE.storyEnd) {
    MODE.storyEnd = true;
    localStorage.setItem('gpm_bob_seen', '1');
    if (typeof showStory !== 'undefined') showStory(true);
  }
}

// ------------------------------------------------------------------ Боб в игре
function bobSpawn() {
  BOB.on = true;
  banner('БОБ ПАРР ПРИШЁЛ ЗА ТОБОЙ');
  if (SFXOK) SFX.play('cut');
  BOB.state = 'enter';
  BOB.x = -90;
  BOB.y = groundY() - 34;
  BOB.t = 0;
  BOB.shootCD = 2.5;
}
function updateBob(dt) {
  if (!BOB.on) return;
  BOB.t += dt;
  var gy = groundY();
  if (BOB.state === 'enter') {
    BOB.x += 620 * dt;
    BOB.alpha = Math.min(1, BOB.alpha + dt * 2);
    if (BOB.x > VW * 0.72) { BOB.state = 'chase'; BOB.t = 0; }
    return;
  }
  if (BOB.state === 'chase') {
    // папа бежит за грибом: чуть отстаёт и «спотыкается» — окно на дэш
    var targetX = P.x + VW * 0.30;
    BOB.x = lerp(BOB.x, targetX, Math.min(1, dt * 2.2));
    if (BOB.x - VW + 30 > P.x) BOB.x = P.x + 120;   // never inside the hero
    BOB.y = gy;
    BOB.alpha = 1;
    if (Math.abs(BOB.x - P.x) < 120 && Math.random() < dt * 2) {
      BOB.state = 'shoot';
    }
    if (UNC.v > 92 && Math.random() < dt * 0.8) { BOB.state = 'grab'; BOB.grab = 0; }
    return;
  }
  if (BOB.state === 'shoot') {
    // «глазной луч»: надо перепрыгнуть или дэшнуть под луч
    BOB.y = gy - 120 - Math.sin(BOB.t * 3) * 30;
    BOB.x = lerp(BOB.x, VW + 160, Math.min(1, dt * 1.4));
    if (Math.random() < dt * 14) {
      addPart(BOB.x - 20, BOB.y - 40, '#ff4a4a', rnd(-120, -260), rnd(-30, 30), 0.6, rnd(3, 6), 0);
    }
    if (Math.abs(BOB.x - P.x) < 70 && Math.abs(BOB.y - (P.y - HH() * 0.4)) < 110 && P.shieldT <= 0 && P.iframe <= 0) {
      gameOver();
    }
    if (BOB.x > VW + 150) { BOB.state = 'chase'; BOB.t = 0; }
    return;
  }
  if (BOB.state === 'grab') {
    // крайний случай: Боб хватает край экрана
    BOB.grab += dt;
    if (BOB.grab > 0.9) { BOB.state = 'chase'; BOB.t = 0; }
  }
}

// ------------------------------------------------------------------ хук в update
var __updBecoming = function (dt) {
  if (STORY.on) { updateStory(dt); return; }
  var playing = G.mode === 'play';
  if (playing) {
    // постепенное разогревание: каждый раунд стадий = +18% к темпу Марио
    G.speedMul = Math.min(2.2, 1 + Math.min(0.8, G.time / 60) + Math.max(0, UNC.stage - 2) * 0.16);
    var decay = UNC.started ? 0.35 + UNC.stage * 0.35 : 1.0 + UNC.stage * 0.8;
    if (P.iframe > 0 || P.shieldT > 0) decay *= 0.65;
    UNC.v = Math.max(0, UNC.v - decay * dt);
    UNC.sinceCanny += dt;
    if (UNC.sinceCanny > 9) { uncannyAdd(3); UNC.sinceCanny = 0; }
    // ---- the 10-second timer: from here the world starts changing ----
    if (!UNC.started && G.time >= BECOMING_DELAY) {
      UNC.started = true;
      SFX.music('unc1');   // the soundtrack switches first: the bright theme dies right here
      G.shake = Math.max(G.shake, 8);
      banner('10 СЕКУНД ПОЗАДИ · ОН ИДЁТ');
    }
    if (UNC.started && !BOB.on) {
      UNC.floor = 1;
      if (UNC.stage < 1) uncannyAdd(16);   // the first stage of horror starts the moment the timer ends
      if (SFXOK) { try { SFX.play('stinger'); } catch (e) {} }
      if (!BOB.on) bobSpawn();
    }
    updateBob(dt);
  }
  if (UNC.lastHit > 0) UNC.lastHit -= dt;
  if (UNC.flash > 0) UNC.flash = Math.max(0, UNC.flash - dt * 2);
};

// ------------------------------------------------------------------ хук в draw: оверлей
function drawCountdown(c) {
  if (!modOn() || UNC.started || G.mode !== 'play') return;
  var left = Math.max(0, BECOMING_DELAY - G.time.toFixed(1));
  var frac = clamp(G.time / BECOMING_DELAY, 0, 1);
  c.save();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  var pulse = 1 + Math.sin(G.t * 6) * 0.05;
  c.translate(CV.width / 2, 74);
  c.scale(pulse, pulse);
  c.font = 'bold 26px system-ui, sans-serif';
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillText('БОБ ПРИДЁТ ЧЕРЕЗ ' + Math.ceil(left), 1, 1);
  c.fillStyle = frac > 0.7 ? '#ff8b6b' : '#ffffff';
  c.fillText('БОБ ПРИДЁТ ЧЕРЕЗ ' + Math.ceil(left), 0, 0);
  c.restore();
  // progress bar
  var w = 240, x = (CV.width - w) / 2, y = 96;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  roundRectPath(c, x, y, w, 8, 4); c.fill();
  c.fillStyle = 'rgba(255,90,60,0.9)';
  roundRectPath(c, x, y, Math.max(4, w * frac), 8, 4); c.fill();
}

function drawBecomingOverlay(c) {
  var st = UNC.stage;
  if (st === 0 && !UNC.started) return;
  var ramp = UNC.started ? 1 : 0;
  var W = CV.width, H = CV.height;
  // красная вигнетка — есть с первой же стадии
  var vig = Math.min(0.78, 0.30 + st * 0.09);
  var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(40,0,0,' + (vig * 0.45).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(60,0,0,' + vig.toFixed(3) + ')');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // обесцвечивание = серый налёт, тяжелеет со стадией
  var gray = Math.min(0.30, 0.10 + st * 0.05);
  c.fillStyle = 'rgba(70,70,80,' + gray.toFixed(3) + ')';
  c.globalCompositeOperation = 'saturation';
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  // общее затемнение растёт со стадией
  var dark = Math.min(0.42, 0.10 + st * 0.07);
  c.fillStyle = 'rgba(8,0,4,' + dark.toFixed(3) + ')';
  c.fillRect(0, 0, W, H);
  // зерно/помехи
  if (st >= 1) {
    var grains = 60 + st * 30;
    for (var gi = 0; gi < grains; gi++) {
      var gx = (gi * 977 + (G.t * 3500 | 0)) % W;
      var gy2 = (gi * 613 + (G.t * 2100 | 0)) % H;
      c.fillStyle = 'rgba(255,255,255,' + (0.03 + Math.random() * 0.05).toFixed(3) + ')';
      c.fillRect(gx, gy2, 2, 2);
    }
  }
  // горизонтальные VHS-полосы
  if (st >= 2) {
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (var i = 0; i < 8; i++) {
      var y = ((G.t * 260 * (i + 1)) % H);
      c.fillRect(0, y, W, 2 + (i % 3));
    }
    c.fillStyle = 'rgba(255,0,60,0.06)';
    c.fillRect(0, (G.t * 60) % H, W, 40);
  }
  // вспышка отката Canny
  if (UNC.flash > 0) {
    c.fillStyle = 'rgba(255,255,230,' + (UNC.flash * 0.35).toFixed(3) + ')';
    c.fillRect(0, 0, W, H);
  }
  // красный «пульс» на удар
  if (UNC.lastHit > 0) {
    c.fillStyle = 'rgba(200,0,0,' + (UNC.lastHit * 0.22).toFixed(3) + ')';
    c.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------------ мини-HUD: лицо Боба + шкала
function drawBecomingHUD(c) {
  var x = 960 - 26, y = 92;
  // портрет Боба
  c.save();
  c.fillStyle = 'rgba(12,10,20,0.72)';
  roundRectPath(c, x - 74, y, 74, 74, 14); c.fill();
  drawBob(c, x - 37, y + 64, 0.30, Math.min(6, 2 + UNC.stage));
  c.restore();
  // шкала
  var bw = 74, bh = 8;
  c.fillStyle = 'rgba(0,0,0,0.45)';
  roundRectPath(c, x - 74, y + 80, bw, bh, 4); c.fill();
  var f = clamp(UNC.v / 100, 0, 1);
  var r = Math.round(80 + 175 * f), g = Math.round(200 - 170 * f), b = Math.round(90 - 60 * f);
  c.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
  roundRectPath(c, x - 74, y + 80, Math.max(3, bw * f), bh, 4); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.font = 'bold 10px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
  c.fillText('UNCANNY ' + UNC.stage + '/' + (STAGES - 1), x - 37, y + 92);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

function modOn() { return MODE.mode === 'becoming'; }

// ------------------------------------------------------------------ старт режима
function leaveBecoming() {
  MODE.mode = 'base';
  BOB.on = false; BOB.state = 'hidden';
  UNC.v = 0; UNC.stage = 0;
  if (SFXOK) { try { SFX.music('canny1'); } catch (e) {} }
  buildButtons();
}

function startBecoming() {
  MODE.mode = 'becoming';
  UNC.v = 0; UNC.stage = 0; UNC.peak = 0; UNC.hud = 0; UNC.lastHit = 0; UNC.streak = 0; UNC.flash = 0; UNC.sinceCanny = 0; UNC.memory = STAGES - 1;
  BOB.on = false; BOB.state = 'hidden'; BOB.alpha = 0; BOB.grab = 0;
  UNC.started = false; UNC.floor = 0;
  SFX.music('canny1');
  startGame();
  banner('BECOMING · ТЫ В ПОРЯДКЕ');
  buildButtons();
}

// ------------------------------------------------------------------ сценки
var STORY = {
  on: false, frame: 0, t: 0, after: null,
  frames: [
    { txt: 'Марио — это ещё не всё, что тебе нужно бояться…', bg: 'rgba(5,5,12,0.94)', face: false },
    { txt: 'За ним пришёл БОБ ПАРР.', bg: 'rgba(40,0,0,0.96)', face: true },
    { txt: '', bg: '#000', face: true }
  ]
};
function showStory(extended) {
  STORY.on = true; STORY.frame = 0; STORY.t = 0;
  SFX.music(extended ? 'unc3' : 'canny1');
  if (SFXOK) SFX.play(extended ? 'cut' : 'select');
}
function updateStory(dt) {
  if (!STORY.on) return;
  STORY.t += dt;
  if (STORY.t > (STORY.frame === 2 ? 1.2 : 2.2)) {
    STORY.t = 0; STORY.frame++;
    if (STORY.frame >= STORY.frames.length) {
      STORY.on = false;
      if (STORY.after === 'extended') { startBecoming(); }
      else if (STORY.after === 'menu') { STORY.after = null; }
    }
  }
}
function drawStory(c) {
  var W = 960, H = 540;
  var f = STORY.frames[STORY.frame];
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = f.bg; c.fillRect(0, 0, CV.width, CV.height);
  c.setTransform(US, 0, 0, US, UOX, UOY);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'bold 26px system-ui, sans-serif';
  c.fillStyle = '#fff';
  var words = f.txt.split(' ');
  var line = '', lines = [];
  for (var i = 0; i < words.length; i++) {
    var test = line ? line + ' ' + words[i] : words[i];
    if (c.measureText(test).width > 760) { lines.push(line); line = words[i]; } else line = test;
  }
  if (line) lines.push(line);
  for (var j = 0; j < lines.length; j++) c.fillText(lines[j], W / 2, H * 0.42 + j * 34);
  if (f.face) {
    var s = STORY.frame === 2 ? (1 + STORY.t * 1.6) : 1;
    drawBob(c, W / 2, H * 0.92, s * 1.7, 6);
  }
  if (STORY.frame === 2) {
    c.font = 'bold 20px system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText('● ● ●', W / 2, H - 30);
  }
}

// ------------------------------------------------------------------ расширенная кнопка в меню
function drawExtendedHint(c) {
  var W = 960, H = 540;
  c.save();
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  if (MODE.mode === 'becoming') {
    c.fillStyle = 'rgba(120,0,0,0.55)';
    roundRectPath(c, 236, 20, 488, 44, 14); c.fill();
    c.font = 'bold 19px system-ui, sans-serif';
    c.fillStyle = '#ff8b8b';
    c.fillText('BECOMING · ЛЮБАЯ ОШИБКА ЗЛИТ БОБА', W / 2, 49);
  } else if (MODE.mode !== 'becoming') {
    var pulse = 0.55 + Math.sin(G.t * 4) * 0.25;
    c.globalAlpha = pulse;
    c.fillStyle = '#ff6b6b';
    c.font = 'bold 13px system-ui, sans-serif';
    c.fillText('▸ РАСШИРЕННАЯ ВЕРСИЯ: за Марио пришёл Боб Парр', W / 2, 519);
    c.globalAlpha = 1;
  } else {
    c.globalAlpha = 0.55;
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.font = '13px system-ui, sans-serif';
    c.fillText('Сыграй один раунд — откроется расширенная версия', W / 2, 519);
    c.globalAlpha = 1;
  }
  c.restore();
  c.textAlign = 'left';
}

// ------------------------------------------------------------------ патч draw()
(function () {
  var _draw = draw;
  draw = function () {
    if (STORY.on) {
      CTX.setTransform(1, 0, 0, 1, 0, 0);
      drawStory(CTX);
      CTX.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    _draw();
    if (modOn()) {
      // оверлей в координатах экрана
      CTX.setTransform(1, 0, 0, 1, 0, 0);
      drawBecomingOverlay(CTX);
      CTX.setTransform(US, 0, 0, US, UOX, UOY);
      if (G.mode === 'play' || G.mode === 'dead') drawBecomingHUD(CTX);
      if (G.mode === 'play') { CTX.setTransform(1, 0, 0, 1, 0, 0); drawCountdown(CTX); }
      if (G.mode === 'menu') drawExtendedHint(CTX);
      CTX.setTransform(1, 0, 0, 1, 0, 0);
    } else if (G.mode === 'menu') {
      CTX.setTransform(US, 0, 0, US, UOX, UOY);
      drawExtendedHint(CTX);
      CTX.setTransform(1, 0, 0, 1, 0, 0);
    }
    // Боб рисуется в мировых координатах — поверх всего мира
    if (BOB.on && BOB.state !== 'hidden') {
      CTX.setTransform(SCALE, 0, 0, SCALE, OX, OY);
      drawBob(CTX, BOB.x, BOB.y - 34, 1.5, Math.min(6, 2 + UNC.stage));
      CTX.setTransform(1, 0, 0, 1, 0, 0);
    }
  };
})();