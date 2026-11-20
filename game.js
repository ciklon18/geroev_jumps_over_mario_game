/* Грибок против Марио — single-file canvas engine, no dependencies.
   Desktop: arrows/WASD, mouse. Phone: taps + swipes (and on-screen buttons). */
'use strict';

const SFXOK = typeof SFX !== 'undefined';
function sfx(name) { if (SFXOK) { try { SFX.play(name); } catch (e) {} } }

function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
    return v;
  } catch (e) { return null; }
}

const CV = document.getElementById('game');
const CTX = CV.getContext('2d', { alpha: false });
const DPR = Math.min(window.devicePixelRatio || 1, 2);

// ------------------------------------------------------------------ layout
let VW = 960, VH = 540, SCALE = 1, OX = 0, OY = 0;
// UI (HUD, menus, buttons) is drawn in a fixed 960x540 box, scaled to the screen
let US = 1, UOX = 0, UOY = 0;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  CV.width = Math.floor(w * DPR); CV.height = Math.floor(h * DPR);
  CV.style.width = w + 'px'; CV.style.height = h + 'px';
  const aspect = w / h;
  VH = 560; VW = Math.round(VH * aspect);
  if (VW < 620) { VW = 620; VH = Math.round(620 / aspect); }
  VW = Math.round(VW); VH = Math.round(VH);
  SCALE = Math.min(CV.width / VW, CV.height / VH);
  OX = (CV.width - VW * SCALE) / 2; OY = (CV.height - VH * SCALE) / 2;
  // fit the whole 960x540 design box on screen (never crop it)
  US = Math.min(CV.width / 960, CV.height / 540);
  UOX = (CV.width - 960 * US) / 2; UOY = (CV.height - 540 * US) / 2;
  if (G.mode === 'play' || G.mode === 'dead') P.y = Math.min(P.y, groundY());
  if (G.mode === 'play' && M.x > VW) M.x = -80;   // never strand Mario off-screen after a resize   // never strand Mario off-screen after a resize
}
window.addEventListener('blur', function () { keys = Object.create(null); clearHolds(); touch.active = false; });
document.addEventListener('visibilitychange', function () { if (document.hidden) { keys = Object.create(null); clearHolds(); } });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 300); });

// ------------------------------------------------------------------- utils
function rnd(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
var TAU = Math.PI * 2;

// ------------------------------------------------------------------ global
var G = {
  mode: 'menu', t: 0, time: 0, level: 1, lastLevel: 1, speedMul: 1,
  dist: 0, score: 0, best: +(store('gpm_best_v1') || 0),
  shake: 0, hitStop: 0, bestFlash: 0, inGame: false,
  banner: '', bannerT: 0, toast: '', toastT: 0
};

var GRAV = 2100;
var REDUCED = false;
try { REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
// --- balance constants (single source of truth) ---
var BAL = {
  dashCDTouch: 0.42, dashCDDesk: 0.55,
  dashTimeTouch: 0.24, dashTimeDesk: 0.19,
  dashSpeedTouch: 1080, dashSpeedDesk: 980,
  iframeTouch: 0.42, iframeDesk: 0.34,
  shieldCD: 2.0, shieldTimeTouch: 0.6, shieldTimeDesk: 0.5
};

var HERO = new Image();
HERO.src = 'assets/hero.png';

// ------------------------------------------------------------------ player
var P = {
  x: 0, y: 0, vy: 0, dashT: 0, dashDir: 1, dashCD: 0,
  onGround: true, jumps: 0, maxJumps: 2,
  shieldT: 0, shieldCD: 0, iframe: 0,
  face: 1, tilt: 0, bob: 0, squash: 0
};

function heroScale() { return clamp(Math.min(VW, VH) / 470, 0.95, 1.55); }
function HW() { return 150 * heroScale(); }
function HH() { return HW() * 1.07; }
function groundY() { return VH - Math.max(52, VH * 0.11); }

function playerRect() {
  var w = HW() * 0.64, h = HH() * 0.80;
  var cy = P.y - HH() * 0.42;
  if (P.shieldT > 0) return { x: P.x - w * 0.62, y: P.y - h * 0.34, w: w * 1.24, h: h * 0.34 };
  return { x: P.x - w / 2, y: cy - h / 2, w: w, h: h };
}

// ------------------------------------------------------------------- mario
var M = {
  x: 0, y: 0, vx: 0, vy: 0, face: 1, onGround: true,
  state: 'run', timer: 0.8, jumps: 0, maxJumps: 1, anim: 0,
  feint: false, feintShown: false, speed: 200
};
var MARIO_W = 40;

// ------------------------------------------------------------------ arrays
var parts = [], pops = [], spores = [], powerups = [], clouds = [];
var playerSpores = 0;
var spawnTimer = 0, nextSpore = 0, nextPower = 14;

// ------------------------------------------------------------------- input
var keys = Object.create(null);
var HELD = { left: false, right: false, jump: false, shield: false, moveDir: 0 };
var pointerButton = {};
function clearHolds() { HELD.left = HELD.right = HELD.jump = HELD.shield = false; HELD.moveDir = 0; pointerButton = {}; }
function beginHold(id) {
  HELD[id] = true;
  if (id === 'left' || id === 'right') { HELD.moveDir = id === 'left' ? -1 : 1; doDash(HELD.moveDir); }
  else if (id === 'jump') doJump();
  else if (id === 'shield') doShield();
}
function endHold(id) {
  if (id !== 'left' && id !== 'right' && id !== 'jump' && id !== 'shield') return;
  HELD[id] = false;
  if ((id === 'left' || id === 'right') && HELD.moveDir === (id === 'left' ? -1 : 1)) {
    var other = id === 'left' ? 'right' : 'left';
    HELD.moveDir = HELD[other] ? (other === 'left' ? -1 : 1) : 0;
  }
}
function updateHeld() {
  if (HELD.moveDir !== 0 && G.mode === 'play' && P.dashCD <= 0 && P.dashT <= 0) {
    doDash(HELD.moveDir);
  }
  if (HELD.jump && !P.onGround && P.vy > 60 && P.jumps < P.maxJumps) doJump();
}
function buttonAt(u) {
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    if (u.x >= b.x && u.x <= b.x + b.w && u.y >= b.y && u.y <= b.y + b.h) return b.id;
  }
  return null;
}
var touch = { active: false, sx: 0, sy: 0, t0: 0, fired: false, id: null };
// on-screen buttons only for phones / tablets and touch laptops
var TOUCHUI = (TOUCHUI) || (navigator.maxTouchPoints > 0);

document.addEventListener('keydown', function (e) {
  var k = e.key;
  if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') e.preventDefault();
  if (keys[k]) return;
  keys[k] = true;
  handleKey(k);
}, { passive: false });
document.addEventListener('keyup', function (e) { keys[e.key] = false; });

function handleKey(k) {
  var K = k.toLowerCase();
  if (K === 'm' || K === 'ь') { toggleMute(); return; }
  if (G.mode === 'menu' || G.mode === 'dead') {
    if (k === ' ' || k === 'Enter' || k === 'ArrowUp') restartRun();
    return;
  }
  if (G.mode !== 'play') return;
  if (K === 'arrowleft' || K === 'a' || K === 'ф') doDash(-1);
  if (K === 'arrowright' || K === 'd' || K === 'в') doDash(1);
  if (k === ' ' || K === 'arrowup' || K === 'w' || K === 'ц' || K === 'enter') doJump();
  if (K === 'arrowdown' || K === 's' || K === 'ы') doShield();
}

// pointer -> 960x540 UI coordinates (same space as the buttons)
function toUI(clientX, clientY) {
  var r = CV.getBoundingClientRect();
  var ux = (clientX - r.left) * (CV.width / r.width);
  var uy = (clientY - r.top) * (CV.height / r.height);
  return { x: (ux - UOX) / US, y: (uy - UOY) / US };
}

CV.addEventListener('pointerdown', function (e) {
  if (SFXOK) { try { SFX.unlock(); } catch (err) {} }
  var u = toUI(e.clientX, e.clientY);
  if (G.mode === 'menu' || G.mode === 'dead') {
    if (hitAnyButton(u)) return;
    restartRun();
    return;
  }
  if (G.mode !== 'play') return;
  if (u.x < 0 || u.x > 960 || u.y < 0 || u.y > 540) return;   // letterboxed area
  var bid = buttonAt(u);
  if (bid && (bid === 'left' || bid === 'right' || bid === 'jump' || bid === 'shield')) {
    pointerButton[e.pointerId] = bid;
    beginHold(bid);
    return;
  }
  try { CV.setPointerCapture(e.pointerId); } catch (err) {}
  touch.active = true; touch.id = e.pointerId;
  touch.sx = e.clientX; touch.sy = e.clientY; touch.t0 = performance.now(); touch.fired = false;
}, { passive: true });

CV.addEventListener('pointermove', function (e) {
  if (!touch.active || e.pointerId !== touch.id || touch.fired) return;
  var dx = e.clientX - touch.sx, dy = e.clientY - touch.sy;
  if (Math.sqrt(dx * dx + dy * dy) < 24) return;
  touch.fired = true;
  if (Math.abs(dx) > Math.abs(dy) * 1.1) doDash(dx > 0 ? 1 : -1);
  else if (dy < 0) doJump();
  else doShield();
}, { passive: true });

function endTouch(e) {
  if (e && touch.active && touch.id !== null && e.pointerId !== undefined && e.pointerId !== touch.id) return;
  if (e && pointerButton[e.pointerId]) { endHold(pointerButton[e.pointerId]); delete pointerButton[e.pointerId]; return; }
  if (!touch.active) return;
  touch.active = false;
  if (!touch.fired && performance.now() - touch.t0 < 420) doJump();
}
CV.addEventListener('pointerup', endTouch, { passive: true });
CV.addEventListener('pointercancel', endTouch, { passive: true });
CV.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// --------------------------------------------------------------- ui buttons
var buttons = [];
function buildButtons() {
  buttons = [];
  if (G.mode === 'menu' || G.mode === 'dead') {
    buttons.push({ id: 'start', x: 250, y: 372, w: 460, h: 62 });
    if (typeof MODE === 'undefined' || MODE.mode !== 'becoming') {
      buttons.push({ id: 'becoming', x: 250, y: 446, w: 460, h: 56 });
    } else {
      buttons.push({ id: 'baseMode', x: 250, y: 446, w: 460, h: 56 });
    }
    buttons.push({ id: 'sound', x: 884, y: 470, w: 56, h: 44 });
  } else if (G.mode === 'play' && TOUCHUI) {
    buttons.push({ id: 'left', x: 24, y: 422, w: 104, h: 96 });
    buttons.push({ id: 'right', x: 142, y: 422, w: 104, h: 96 });
    buttons.push({ id: 'shield', x: 728, y: 436, w: 92, h: 92 });
    buttons.push({ id: 'jump', x: 836, y: 404, w: 104, h: 120 });
  }
}
function hitAnyButton(u) {
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    if (u.x >= b.x && u.x <= b.x + b.w && u.y >= b.y && u.y <= b.y + b.h) {
      pressButton(b.id);
      return true;
    }
  }
  return false;
}
function pressButton(id) {
  if (id === 'baseMode') { leaveBecoming(); return; }
  if (id === 'start') { restartRun(); }
  else if (id === 'becoming') startBecoming();
  else if (id === 'sound') toggleMute();
  else if (id === 'left') doDash(-1);
  else if (id === 'right') doDash(1);
  else if (id === 'jump') doJump();
  else if (id === 'shield') doShield();
}

// ------------------------------------------------------------------ actions
function doDash(dir) {
  if (G.mode !== 'play' || P.dashCD > 0) return;
  P.dashCD = TOUCHUI ? BAL.dashCDTouch : BAL.dashCDDesk; P.dashT = TOUCHUI ? BAL.dashTimeTouch : BAL.dashTimeDesk; P.dashDir = dir; P.face = dir;
  P.iframe = TOUCHUI ? BAL.iframeTouch : BAL.iframeDesk;
  sfx('dash');
  for (var i = 0; i < 9; i++) addPart(P.x - dir * HW() * 0.25, P.y - HH() * rnd(0.2, 0.6), '#dff3ff', rnd(60, 200) * -dir, rnd(-90, 20), rnd(0.25, 0.45), rnd(2, 5));
}
function doJump() {
  if (G.mode !== 'play') return;
  if (P.onGround) {
    P.vy = -880; P.onGround = false; P.jumps = 1;
  } else if (P.jumps < P.maxJumps) {
    P.vy = -760; P.jumps++;
    for (var i = 0; i < 10; i++) addPart(P.x + rnd(-30, 30), P.y, '#fff3b0', rnd(-90, 90), rnd(20, 130), 0.3, rnd(2, 5));
  } else return;
  P.squash = 1;
  sfx('jump');
}
function doShield() {
  if (G.mode !== 'play' || P.shieldCD > 0) return;
  P.shieldCD = BAL.shieldCD; P.shieldT = TOUCHUI ? BAL.shieldTimeTouch : BAL.shieldTimeDesk;
  sfx('shield');
  for (var i = 0; i < 8; i++) addPart(P.x + rnd(-34, 34), P.y - HH() * 0.65, '#ffe9a8', rnd(-70, 70), rnd(-60, 20), 0.3, rnd(2, 4));
}
function toggleMute() {
  if (!SFXOK) return;
  SFX.muted = !SFX.muted;
  G.toast = SFX.muted ? 'Звук выключен' : 'Звук включён';
  G.toastT = 1.6;
}

// ------------------------------------------------------------- game control
function restartRun() {
  if (typeof MODE !== 'undefined' && MODE.mode === 'becoming' && typeof startBecoming === 'function') startBecoming();
  else startGame();
}

function startGame() {
  clearHolds();
  if (SFXOK) { try { SFX.unlock(); SFX.music(true); } catch (e) {} }
  G.mode = 'play'; G.inGame = true; G.t = 0; G.time = 0; G.dist = 0; G.score = 0;
  G.level = 1; G.lastLevel = 1; G.speedMul = 1;
  G.shake = 0; G.hitStop = 0; G.bannerT = 0;
  parts = []; pops = []; spores = []; powerups = []; clouds = [];
  P.x = VW * 0.55; P.y = groundY(); P.vy = 0; P.dashT = 0; P.dashCD = 0;
  P.onGround = true; P.jumps = 0; P.shieldT = 0; P.shieldCD = 0; P.iframe = 0;
  P.face = 1; P.tilt = 0; P.squash = 0;
  M.x = -140; M.y = groundY(); M.vy = 0; M.vx = 0; M.state = 'run'; M.timer = 0.7; M.speed = 275;
  M.onGround = true; M.jumps = 0; M.maxJumps = 1; M.feint = false; M.feintShown = false;
  playerSpores = 0;
  spawnTimer = 0.9; nextSpore = 0.5; nextPower = 14;
  if (typeof MODE !== 'undefined' && MODE.mode === 'becoming') {
    UNC.v = 0; UNC.stage = 0; UNC.streak = 0; UNC.lastHit = 0; UNC.sinceCanny = 0; UNC.flash = 0;
    UNC.started = false; UNC.floor = 0;
    if (typeof BOB !== 'undefined') { BOB.on = false; BOB.state = 'hidden'; }
    SFX.music('canny1');
    spawnTimer = 0.7;
  }
  banner('РАУНД 1 · ГРИБНОЕ ПОЛЕ');
  buildButtons();
  sfx('start');
}

function gameOver() {
  clearHolds();
  if (G.mode !== 'play') return;
  G.mode = 'dead';
  G.shake = 20; G.hitStop = 0.45;
  sfx('squash');
  if (SFXOK) { try { SFX.music(false); } catch (e) {} }
  var final = Math.floor(G.score);
  if (final > G.best) { G.best = final; G.bestFlash = 1; store('gpm_best_v1', G.best); }
  for (var i = 0; i < 26; i++) {
    addPart(P.x + rnd(-40, 40), P.y - HH() * 0.5, ['#b5523f', '#f0d8c0', '#c0d8a0'][i % 3], rnd(-260, 260), rnd(-320, -40), rnd(0.5, 1.1), rnd(2, 6));
  }
  if (typeof BOB !== 'undefined') { BOB.on = false; BOB.state = 'hidden'; }
  buildButtons();
}

function banner(t) { G.banner = t; G.bannerT = 2.2; }

// ---------------------------------------------------------------- effects
function addPart(x, y, color, vx, vy, life, r, grav) {
  if (parts.length > 260) parts.shift();
  parts.push({ x: x, y: y, vx: vx, vy: vy, color: color, life: life, max: life, r: r, g: grav === undefined ? 900 : grav });
}
function popup(x, y, text, color) {
  if (pops.length > 24) pops.shift();
  pops.push({ x: x, y: y, text: text, color: color || '#fff', life: 0.95 });
}

// ------------------------------------------------------------------- mario
function marioParams() {
  var lv = G.level;
  return { speed: (275 + lv * 55) * G.speedMul, jumpV: 1150 + lv * 35 };
}

function marioSpawn() {
  M.x = -90 - rnd(0, 60);
  M.y = groundY();
  M.vx = 0; M.vy = 0; M.onGround = true;
  M.state = 'run';
  M.timer = rnd(0.15, 0.5);
  M.maxJumps = 2;
  M.jumps = 0;
  M.feint = G.level >= 3 && Math.random() < 0.45;
  M.feintShown = false;
  M.face = 1;
}

// Mario decides mid-run: he aims at where the mushroom will be when he lands.
function startJump(p) {
  var g = GRAV * 0.9;
  var lead = P.dashT > 0 ? P.dashDir * 400 * P.dashT : 0;
  var aimX = P.x + lead * 0.5;
  var tAir = clamp(Math.abs(aimX - M.x) / Math.max(130, M.vx || p.speed), 0.28, 1.2);
  var H = Math.max(90, (P.y - HH() * 0.4) - groundY());
  var apex = HH() * 0.8;
  var early = 0.6 * tAir;
  var vv = Math.max((apex + 0.5 * g * early * early) / early, (H + 0.5 * g * tAir * tAir) / Math.max(0.15, tAir));
  var v = -clamp(vv, p.jumpV * 0.45, p.jumpV * 0.82);
  M.maxJumps = 2;
  M.vy = v; M.state = 'air'; M.jumps = 1; M.onGround = false;
  M.timer = 0;
  sfx('mjump');
}

function updateMario(dt) {
  var gy = groundY();
  if (M.hitLock > 0) M.hitLock -= dt;
  var p = marioParams();
  M.speed = p.speed;
  M.timer -= dt;
  M.anim += dt * (6 + M.speed / 40);

  if (M.state === 'run') {
    M.vx += (p.speed - M.vx) * Math.min(1, dt * 3.2);
    var gap = P.x - M.x;
    if (gap > 30 && gap < VW * 0.8) {
      var timeToReach = Math.max(0.05, gap / Math.max(120, M.vx || p.speed));
      if (M.feint && !M.feintShown && gap < 340) {
        M.feintShown = true;
        M.state = 'feint'; M.timer = 0.26; sfx('feint');
      } else if (M.timer <= 0 && timeToReach < 0.40 + Math.random() * 0.12) {
        startJump(p);
      }
    }
  } else if (M.state === 'feint') {
    M.vx += (-20 - M.vx) * Math.min(1, dt * 6);
    if (M.timer <= 0) {
      if (Math.random() < 0.5) startJump(p);
      else { M.state = 'run'; M.timer = rnd(0.1, 0.3); }
    }
  } else if (M.state === 'air') {
    M.vx += (p.speed * 1.12 - M.vx) * Math.min(1, dt * 3);
  }

  M.vy += GRAV * 0.9 * dt;
  M.x += M.vx * dt;
  if (M.x > VW + 80) { M.x = VW + 80; M.vx = Math.min(M.vx, 0); }
  M.y += M.vy * dt;

  if (M.y >= gy) {
    if (!M.onGround && M.state === 'air') {
      M.state = 'run';
      M.timer = rnd(0.12, 0.45);
      M.jumps = 0;
      M.feint = G.level >= 3 && Math.random() < 0.45;
      M.feintShown = false;
      for (var i = 0; i < 7; i++) addPart(M.x, gy, '#d9c69a', rnd(-120, 120), rnd(-140, -30), 0.35, rnd(2, 4));
      sfx('ml');
    }
    M.y = gy; M.vy = 0; M.onGround = true;
  } else M.onGround = false;

  M.face = M.x > P.x ? -1 : 1;

  // ---- collision: one rule, no stacked patches.
  // Mario's BODY (a narrow box around his torso) overlapping the mushroom's head box kills you,
  // unless you are dashing or hiding under the hat (invulnerability windows).
  var r = playerRect();
  var mx = M.x;
  var top = M.y - 64;              // torso only (the sprite is drawn above M.y)
  var bottom = M.y + 8;            // feet
  var marioLeft = mx - MARIO_W * 0.5, marioRight = mx + MARIO_W * 0.5;
  var bodyOverlap = marioRight > r.x + r.w * 0.12 && marioLeft < r.x + r.w * 0.88;
  var headOverlap = bottom > r.y && top < r.y + r.h * 0.8;
  var grace = (typeof UNC !== 'undefined' && typeof modOn === 'function' && modOn() && !UNC.started);
  if (grace && bodyOverlap && headOverlap) {
    // warm-up: he bounces off harmlessly
    M.vy = -520; M.onGround = false; M.state = 'air';
    M.x += (M.x > P.x ? 60 : -60);
    if (typeof popup === 'function') popup(P.x, playerRect().y - 6, 'ЕЩЁ РАНО', '#9fe8ff');
    return;
  }
  if (bodyOverlap && headOverlap && !(M.hitLock > 0)) {
    if (P.iframe > 0 || P.shieldT > 0) {
      if (M.hitLock > 0) return;
      M.hitLock = 0.35;
      P.iframe = Math.max(P.iframe, 0.25);
      M.vy = -640; M.onGround = false; M.state = 'air'; M.jumps = 2;
      M.x += (M.x > P.x ? 70 : -70);
      G.score += 40;
      if (typeof uncannyAdd === 'function' && typeof modOn === 'function' && modOn()) {
        uncannyAdd(-4);
      }
      popup(P.x, r.y - 6, P.shieldT > 0 ? 'ПОД ШЛЯПКУ +40' : 'УВОРОТ +40', '#9fe8ff');
      sfx('stomp'); G.shake = 6;
      P.shieldT = 0;
      for (var j = 0; j < 12; j++) addPart(P.x, r.y, '#9fe8ff', rnd(-220, 220), rnd(-220, 40), 0.45, 3);
      return;
    }
    if (typeof uncannyAdd === 'function' && typeof modOn === 'function' && modOn()) { uncannyAdd(30); }
    gameOver();
  }
}

// ------------------------------------------------------------------- spawns
function updateSpawns(dt) {
  // hard safety: a Mario that ended up outside the field (resize / dash by / glitch) always comes back
  if (M.x > VW + 60) {
    M.x = -90; M.vx = 0; M.vy = 0; M.state = 'run'; M.timer = 0.2;
  }
  spawnTimer -= dt;
  if (spawnTimer <= 0 && M.state === 'run' && M.x < -70) {
    if (typeof uncannyAdd === 'function' && typeof modOn === 'function' && modOn()) uncannyAdd(1.2);
    marioSpawn();
    spawnTimer = Math.max(0.45, rnd(1.0, 1.7) - G.level * 0.22);
  }

  nextSpore -= dt;
  if (nextSpore <= 0) {
    nextSpore = rnd(0.7, 1.4);
    var n = Math.random() < 0.3 ? 3 : 1;
    for (var i = 0; i < n; i++) {
      spores.push({ x: VW - 40 - i * 46, y: rnd(VH * 0.12, VH * 0.5), r: 13, ph: rnd(0, TAU) });
    }
  }
  nextPower -= dt;
  if (nextPower <= 0) {
    nextPower = rnd(16, 22);
    powerups.push({ x: VW - 60, y: rnd(VH * 0.25, VH * 0.5), r: 16, ph: 0 });
  }

  var s, q;
  for (s = 0; s < spores.length; s++) { spores[s].x -= 150 * dt; spores[s].ph += dt * 3; }
  for (q = 0; q < powerups.length; q++) { powerups[q].x -= 150 * dt; powerups[q].ph += dt * 4; }

  var r = playerRect();
  for (s = spores.length - 1; s >= 0; s--) {
    var sp = spores[s];
    if (sp.x < -40) { spores.splice(s, 1); continue; }
    if (sp.x > r.x - sp.r && sp.x < r.x + r.w + sp.r && sp.y > r.y - sp.r && sp.y < r.y + r.h + sp.r) {
      spores.splice(s, 1);
      playerSpores++;
      var pts = playerSpores % 10 === 0 ? 50 : 10;
      if (pts === 50 && typeof uncannyAdd === 'function' && typeof modOn === 'function' && modOn()) uncannyAdd(-6);
      G.score += pts;
      popup(sp.x, sp.y, '+' + pts, '#ffe066');
      sfx('coin');
      for (var k = 0; k < 8; k++) addPart(sp.x, sp.y, '#ffe066', rnd(-140, 140), rnd(-180, 20), 0.45, 3, 500);
    }
  }
  for (q = powerups.length - 1; q >= 0; q--) {
    var pu = powerups[q];
    if (pu.x < -40) { powerups.splice(q, 1); continue; }
    if (pu.x > r.x - pu.r && pu.x < r.x + r.w + pu.r && pu.y > r.y - pu.r && pu.y < r.y + r.h + pu.r) {
      powerups.splice(q, 1);
      P.iframe = Math.max(P.iframe, 1.4);
      popup(pu.x, pu.y, 'СУПЕР-СПОРА!', '#ff8fb0');
      sfx('power');
      banner('СУПЕР-СПОРА · неуязвимость');
      for (var m = 0; m < 22; m++) addPart(pu.x, pu.y, m % 2 ? '#ff8fb0' : '#ffd34d', rnd(-260, 260), rnd(-260, 60), 0.7, rnd(2, 5), 400);
    }
  }
}

// ------------------------------------------------------------------ update
function update(dt) {
  G.t += dt;
  if (G.bannerT > 0) G.bannerT -= dt;
  if (G.toastT > 0) G.toastT -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 46);
  if (G.bestFlash > 0) G.bestFlash = Math.max(0, G.bestFlash - dt);
  if (typeof __updBecoming === 'function') __updBecoming(dt);

  if (G.mode === 'menu') {
    P.x = VW * 0.18;
    P.y = groundY() - Math.abs(Math.sin(G.t * 1.8)) * 14;
    P.tilt = Math.sin(G.t * 1.8) * 0.05;
    P.bob = G.t * 2;
    M.x = VW * 0.80 + Math.sin(G.t * 0.8) * 60;
    M.y = groundY(); M.state = 'run'; M.anim = G.t * 8; M.face = -1;
    cloudsProc(dt); particles(dt); popsProc(dt);
    return;
  }

  if (G.hitStop > 0) { G.hitStop -= dt; return; }

  if (G.mode === 'dead') {
    M.x += 30 * dt; M.anim += dt * 4;
    particles(dt); popsProc(dt); cloudsProc(dt);
    return;
  }

  // ---------------- playing
  G.time += dt;
  G.level = G.time < 16 ? 1 : G.time < 36 ? 2 : 3;
  if (typeof modOn !== 'function' || !modOn()) G.speedMul = 1 + Math.min(1.0, G.time / 45);
  if (G.level !== G.lastLevel) {
    G.lastLevel = G.level;
    banner(G.level === 2 ? 'РАУНД 2 · НОЧНОЙ ЛЕС' : 'РАУНД 3 · ЗАМОК');
  }

  P.dashCD = Math.max(0, P.dashCD - dt);
  P.shieldCD = Math.max(0, P.shieldCD - dt);
  P.shieldT = Math.max(0, P.shieldT - dt);
  P.iframe = Math.max(0, P.iframe - dt);
  P.squash = Math.max(0, P.squash - dt * 5);
  P.bob += dt * 8;

  if (P.dashT > 0) {
    P.dashT -= dt;
    P.x += P.dashDir * (TOUCHUI ? BAL.dashSpeedTouch : BAL.dashSpeedDesk) * dt;
    P.tilt = lerp(P.tilt, -P.dashDir * 0.22, Math.min(1, dt * 14));
  } else {
    var steer = HELD.moveDir;
    if (keys['ArrowLeft'] || keys['a'] || keys['A'] || keys['ф']) steer -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D'] || keys['в']) steer += 1;
    P.x += clamp(steer, -1, 1) * 430 * dt;
    P.tilt = lerp(P.tilt, steer * 0.1, Math.min(1, dt * 10));
  }

  P.vy += GRAV * (typeof UNC !== 'undefined' && typeof modOn === 'function' && modOn() ? 1 + UNC.stage * 0.05 : 1) * dt;
  P.y += P.vy * dt;
  if (typeof BOB !== 'undefined' && BOB.on && BOB.state === 'grab') {
    if (P.dashT > 0 || P.iframe > 0) { BOB.state = 'chase'; BOB.grab = 0; if (typeof uncannyAdd === 'function') uncannyAdd(-5); }
    else { P.x += (BOB.x - P.x) * Math.min(1, dt * 2.2); }
  }
  var gy = groundY();
  if (P.y >= gy) {
    if (!P.onGround && P.vy > 500) {
      for (var i = 0; i < 8; i++) addPart(P.x + rnd(-30, 30), gy, '#c9e6a8', rnd(-120, 120), rnd(-160, -30), 0.35, 3);
    }
    P.y = gy; P.vy = 0; P.onGround = true; P.jumps = 0;
  } else P.onGround = false;

  var margin = HW() * 0.72;
  if (P.x < margin) { P.x = margin; if (P.dashT > 0) P.dashT = 0; }
  if (P.x > VW - margin) { P.x = VW - margin; if (P.dashT > 0) P.dashT = 0; }

  updateHeld();
  updateMario(dt);
  if (G.mode !== 'play') return;
  updateSpawns(dt);

  G.score += dt * 10 * G.speedMul;
  G.dist += dt * 90 * G.speedMul;


  particles(dt); popsProc(dt); cloudsProc(dt);
}

// -------------------------------------------------------------- background
function cloudsProc(dt) {
  if (clouds.length === 0) {
    for (var i = 0; i < 8; i++) clouds.push({ x: rnd(0, VW), y: rnd(30, VH * 0.45), s: rnd(0.6, 1.7), v: rnd(10, 30) });
  }
  for (var j = 0; j < clouds.length; j++) {
    var c = clouds[j];
    c.x -= (c.v + (G.mode === 'play' ? 22 : 8)) * dt;
    if (c.x < -240) { c.x = VW + rnd(40, 300); c.y = rnd(30, VH * 0.45); }
  }
}
function particles(dt) {
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.99;
  }
}
function popsProc(dt) {
  for (var i = pops.length - 1; i >= 0; i--) {
    var p = pops[i];
    p.life -= dt; p.y -= 60 * dt;
    if (p.life <= 0) pops.splice(i, 1);
  }
}

// ------------------------------------------------------------------ render
function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function draw() {
  CTX.setTransform(1, 0, 0, 1, 0, 0);
  CTX.fillStyle = '#000';
  CTX.fillRect(0, 0, CV.width, CV.height);

  // ---- world
  CTX.setTransform(SCALE, 0, 0, SCALE, OX, OY);
  CTX.save();
  if (G.shake > 0.4) CTX.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake));
  drawSky(CTX);
  drawGround(CTX);
  drawMario(CTX);
  drawHero(CTX);
  drawCollectibles(CTX);
  drawWorldParticles(CTX);
  CTX.restore();

  // ---- ui (fixed 960x540 design box)
  CTX.setTransform(US, 0, 0, US, UOX, UOY);
  if (G.mode === 'menu') drawMenu(CTX);
  if (G.mode === 'dead') drawDead(CTX);
  if (G.inGame) drawHUD(CTX);
  drawPops(CTX);
  drawButtons(CTX);
  drawBanners(CTX);
  CTX.setTransform(1, 0, 0, 1, 0, 0);
}

var SKY_CACHE = {};
function skyGradient(c, lv) {
  var key = lv + '@' + Math.round(VH);
  if (SKY_CACHE[key]) return SKY_CACHE[key];
  var g = c.createLinearGradient(0, 0, 0, VH);
  if (lv === 1) { g.addColorStop(0, '#5fc4f5'); g.addColorStop(0.65, '#b7e8ff'); g.addColorStop(1, '#e9f7d8'); }
  else if (lv === 2) { g.addColorStop(0, '#152244'); g.addColorStop(0.6, '#2c4270'); g.addColorStop(1, '#6a7f8f'); }
  else { g.addColorStop(0, '#2a0d1b'); g.addColorStop(0.55, '#6d1f2c'); g.addColorStop(1, '#c0522b'); }
  SKY_CACHE[key] = g;
  return g;
}

function drawSky(c) {
  var lv = (G.mode === 'menu') ? 1 : (G.level || 1);
  c.fillStyle = skyGradient(c, lv); c.fillRect(0, 0, VW, VH);

  var i;
  if (lv === 1) {
    c.fillStyle = 'rgba(255,255,255,0.82)';
    for (i = 0; i < clouds.length; i++) blobCloud(c, clouds[i].x, clouds[i].y, 46 * clouds[i].s);
    c.fillStyle = '#ffe98a';
    c.beginPath(); c.arc(VW * 0.86, VH * 0.14, 40, 0, TAU); c.fill();
  } else if (lv === 2) {
    c.fillStyle = 'rgba(255,255,255,0.10)';
    for (i = 0; i < clouds.length; i++) blobCloud(c, clouds[i].x, clouds[i].y, 52 * clouds[i].s);
    c.fillStyle = 'rgba(238,244,255,0.18)';
    c.beginPath(); c.arc(VW * 0.82, VH * 0.15, 58, 0, TAU); c.fill();
    c.fillStyle = '#eef4ff';
    c.beginPath(); c.arc(VW * 0.82, VH * 0.15, 34, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,240,140,0.85)';
    for (i = 0; i < 22; i++) {
      var fx = (i * 137 + G.t * 18) % VW;
      var fy = VH * 0.35 + Math.sin(G.t * 1.6 + i) * 40 + (i % 5) * 34;
      c.beginPath(); c.arc(fx, fy, 2.2, 0, TAU); c.fill();
    }
  } else {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (i = 0; i < 5; i++) {
      var sx = (i * 260 + G.t * 30) % (VW + 260) - 130;
      c.beginPath(); c.arc(sx, VH * 0.18 + (i % 3) * 40, 70 + i * 12, 0, TAU); c.fill();
    }
    c.fillStyle = 'rgba(255,140,60,0.35)';
    for (i = 0; i < 30; i++) {
      var ex = (i * 97 + G.t * 60) % VW;
      var ey = VH - ((G.t * 40 + i * 53) % (VH * 0.8));
      c.fillRect(ex, ey, 2, 6);
    }
  }

  var shift = G.mode === 'play' ? (G.dist * 0.35) % 420 : (G.t * 8) % 420;
  c.fillStyle = lv === 1 ? '#8fd46b' : lv === 2 ? '#1c2b3a' : '#3a1a1f';
  for (i = -1; i < Math.ceil(VW / 420) + 1; i++) {
    var bx = i * 420 - shift;
    c.beginPath();
    c.moveTo(bx, VH); c.quadraticCurveTo(bx + 210, VH * 0.52, bx + 420, VH); c.fill();
  }
  c.fillStyle = lv === 1 ? '#5fbf52' : lv === 2 ? '#12202c' : '#241013';
  var shift2 = G.mode === 'play' ? (G.dist * 0.6) % 300 : (G.t * 14) % 300;
  for (i = -1; i < Math.ceil(VW / 300) + 1; i++) {
    var cx2 = i * 300 - shift2;
    c.beginPath();
    c.moveTo(cx2, VH); c.quadraticCurveTo(cx2 + 150, VH * 0.66, cx2 + 300, VH); c.fill();
  }
}

function blobCloud(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, TAU);
  c.arc(x + r * 0.7, y + r * 0.1, r * 0.48, 0, TAU);
  c.arc(x - r * 0.7, y + r * 0.12, r * 0.44, 0, TAU);
  c.arc(x + r * 0.1, y - r * 0.34, r * 0.46, 0, TAU);
  c.fill();
}

function drawGround(c) {
  var gy = groundY();
  var lv = (G.mode === 'menu') ? 1 : (G.level || 1);
  c.fillStyle = lv === 1 ? '#7a4f2a' : lv === 2 ? '#2b2418' : '#33232b';
  c.fillRect(0, gy, VW, VH - gy);
  c.fillStyle = lv === 1 ? '#6cbf4a' : lv === 2 ? '#1f3a2a' : '#5a2a2e';
  c.fillRect(0, gy, VW, Math.max(12, VH * 0.022));
  c.fillStyle = lv === 1 ? '#58a83c' : lv === 2 ? '#16281d' : '#42181c';
  var off = G.mode === 'play' ? (G.dist * 1.2) % 48 : (G.t * 20) % 48;
  for (var x = -48; x < VW + 48; x += 48) {
    c.beginPath();
    c.moveTo(x - off, gy + 12);
    c.lineTo(x - off + 24, gy + 12 - 10);
    c.lineTo(x - off + 48, gy + 12);
    c.fill();
  }
  c.fillStyle = 'rgba(0,0,0,0.08)';
  for (var y = -48; y < VW + 48; y += 48) c.fillRect(y - off, gy + 22, 24, 4);
}

// ------------------------------------------------------------------ mario
function drawMario(c) {
  var gy = groundY();
  var bob = M.onGround ? Math.abs(Math.sin(M.anim)) * 6 : 0;
  var x = M.x, y = M.y - bob;
  c.save();
  c.translate(x, y);
  c.scale(M.face * 1.12, 1.12);

  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(0, (gy - y) + 2, 26, 8, 0, 0, TAU); c.fill();

  var swing = M.onGround ? Math.sin(M.anim) * 0.5 : 0.35;
  c.strokeStyle = '#2b3a8c'; c.lineWidth = 9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-5, -22); c.lineTo(-5 + swing * 20, -3); c.stroke();
  c.beginPath(); c.moveTo(6, -22); c.lineTo(6 - swing * 20, -3); c.stroke();
  c.fillStyle = '#5a2a12';
  c.beginPath(); c.ellipse(-5 + swing * 20 - 4, -2, 12, 6, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(6 - swing * 20 + 4, -2, 12, 6, 0, 0, TAU); c.fill();

  c.fillStyle = '#2f4fb0';
  roundRectPath(c, -15, -46, 30, 28, 8); c.fill();

  var armA = M.onGround ? Math.sin(M.anim + Math.PI) * 0.6 : -0.9;
  c.strokeStyle = '#e0312f'; c.lineWidth = 8;
  c.beginPath(); c.moveTo(-12, -42); c.lineTo(-12 + Math.sin(armA) * 16, -30 + Math.cos(armA) * 10); c.stroke();
  c.beginPath(); c.moveTo(12, -42); c.lineTo(12 + Math.sin(armA) * 16, -30 + Math.cos(armA) * 10); c.stroke();
  c.fillStyle = '#ffd9b3';
  c.beginPath(); c.arc(-12 + Math.sin(armA) * 16, -30 + Math.cos(armA) * 10, 5, 0, TAU); c.fill();
  c.beginPath(); c.arc(12 + Math.sin(armA) * 16, -30 + Math.cos(armA) * 10, 5, 0, TAU); c.fill();

  c.fillStyle = '#ffd9b3';
  c.beginPath(); c.arc(2, -58, 15, 0, TAU); c.fill();
  c.beginPath(); c.arc(15, -56, 6, 0, TAU); c.fill();
  c.fillStyle = '#1b1b26';
  c.beginPath(); c.arc(10, -62, 2.6, 0, TAU); c.fill();
  c.fillStyle = '#2a1a10';
  c.beginPath(); c.ellipse(13, -49, 9, 4.5, 0.1, 0, TAU); c.fill();

  c.fillStyle = '#e0312f';
  c.beginPath();
  c.moveTo(-14, -68);
  c.quadraticCurveTo(2, -88, 18, -68);
  c.lineTo(18, -64); c.lineTo(-14, -64); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(14, -66, 18, 5, 0, 0, TAU); c.fill();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(2, -73, 5, 0, TAU); c.fill();
  c.fillStyle = '#e0312f';
  c.font = 'bold 7px sans-serif'; c.textAlign = 'center';
  c.fillText('M', 2, -70.5);

  if (M.state === 'feint') {
    c.fillStyle = '#fff'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center';
    c.fillText('?', 0, -100);
  }
  c.restore();
  c.textAlign = 'left';
}

// ------------------------------------------------------------------- hero
function drawHero(c) {
  var w = HW(), h = HH();
  var bob = (G.mode === 'play' && P.onGround) ? Math.abs(Math.sin(P.bob)) * 3 : 0;
  var gy = groundY();

  c.save();
  var air = clamp((gy - P.y) / 160, 0, 1);
  c.fillStyle = 'rgba(0,0,0,' + (0.26 - air * 0.16).toFixed(3) + ')';
  c.beginPath(); c.ellipse(P.x, gy + 4, w * 0.42 * (1 - air * 0.3), 10 * (1 - air * 0.4), 0, 0, TAU); c.fill();

  c.translate(P.x, P.y);
  c.rotate(P.tilt);
  var sq = P.squash;
  var sx = 1 + (P.shieldT > 0 ? 0.18 : 0) + sq * 0.08;
  var sy = 1 + (P.shieldT > 0 ? -0.24 : 0) - sq * 0.08;
  c.scale(sx, sy);
  c.translate(0, -bob);

  if (P.iframe > 0 && Math.floor(P.iframe * 20) % 2 === 0) c.globalAlpha = 0.55;

  if (HERO.complete && HERO.naturalWidth) {
    c.drawImage(HERO, -w / 2, -h, w, h);
  } else {
    c.fillStyle = '#f3e7cf';
    c.beginPath(); c.ellipse(0, -h * 0.7, w * 0.45, h * 0.3, 0, 0, TAU); c.fill();
    c.fillStyle = '#5f4632';
    c.beginPath(); c.ellipse(0, -h * 0.3, w * 0.26, h * 0.3, 0, 0, TAU); c.fill();
  }

  if (P.iframe > 1.0) {
    c.strokeStyle = 'rgba(255,143,176,' + (0.5 + Math.sin(G.t * 14) * 0.3).toFixed(3) + ')';
    c.lineWidth = 5;
    c.beginPath(); c.ellipse(0, -h * 0.5, w * 0.62, h * 0.58, 0, 0, TAU); c.stroke();
  }
  if (P.shieldT > 0) {
    c.strokeStyle = 'rgba(255,233,168,0.9)'; c.lineWidth = 6;
    c.beginPath(); c.ellipse(0, -h * 0.8, w * 0.55, h * 0.24, 0, 0, TAU); c.stroke();
  }
  c.restore();
}

// --------------------------------------------------------- collectibles
function drawCollectibles(c) {
  var i;
  for (i = 0; i < spores.length; i++) {
    var s = spores[i];
    var yy = s.y + Math.sin(s.ph) * 6;
    c.save(); c.translate(s.x, yy);
    c.fillStyle = 'rgba(255,214,64,0.25)';
    c.beginPath(); c.arc(0, 0, s.r * 1.9, 0, TAU); c.fill();
    c.fillStyle = '#ffd34d'; c.strokeStyle = '#c99a00'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, s.r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#fff6c0';
    c.beginPath(); c.arc(-s.r * 0.3, -s.r * 0.3, s.r * 0.3, 0, TAU); c.fill();
    c.restore();
  }
  for (i = 0; i < powerups.length; i++) {
    var p = powerups[i];
    var py = p.y + Math.sin(p.ph) * 8;
    c.save(); c.translate(p.x, py); c.rotate(Math.sin(p.ph * 0.5) * 0.2);
    c.fillStyle = 'rgba(255,143,176,0.3)';
    c.beginPath(); c.arc(0, 0, p.r * 2, 0, TAU); c.fill();
    c.fillStyle = '#ff5f8a';
    c.beginPath(); c.arc(0, -2, p.r * 0.95, Math.PI, 0); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(-8, -8, 4, 0, TAU); c.fill();
    c.beginPath(); c.arc(6, -11, 3.4, 0, TAU); c.fill();
    c.beginPath(); c.arc(0, -3, 2.6, 0, TAU); c.fill();
    c.fillStyle = '#f3e7cf';
    c.fillRect(-6, -2, 12, 13);
    c.restore();
  }
}

function drawWorldParticles(c) {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    c.globalAlpha = clamp(p.life / p.max, 0, 1);
    c.fillStyle = p.color;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}

// --------------------------------------------------------------------- HUD
function drawHUD(c) {
  var pad = 22;
  c.textAlign = 'left'; c.textBaseline = 'top';

  c.font = 'bold 34px system-ui, sans-serif';
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillText(Math.floor(G.score).toString(), pad + 2, pad + 2);
  c.fillStyle = '#fff';
  c.fillText(Math.floor(G.score).toString(), pad, pad);

  c.font = 'bold 15px system-ui, sans-serif';
  c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineJoin = 'round';
  c.strokeText('РЕКОРД ' + Math.max(G.best, Math.floor(G.score)), pad, pad + 44);
  c.fillStyle = '#fff';
  c.fillText('РЕКОРД ' + Math.max(G.best, Math.floor(G.score)), pad, pad + 44);

  c.textAlign = 'center';
  c.font = 'bold 22px system-ui, sans-serif';
  c.fillStyle = '#ffe066';
  c.fillText('✶ ' + playerSpores, 480, pad + 2);
  for (var i = 0; i < 3; i++) {
    c.fillStyle = i < G.level ? '#fff' : 'rgba(255,255,255,0.3)';
    c.beginPath(); c.arc(480 - 24 + i * 24, pad + 46, 8, 0, TAU); c.fill();
  }

  var cw = 118, ch = 20, cx = 960 - pad - cw;
  drawCooldown(c, cx, pad + 4, cw, ch, 1 - P.dashCD / (TOUCHUI ? BAL.dashCDTouch : BAL.dashCDDesk), 'ДЭШ ← →', '#7fd8ff');
  drawCooldown(c, cx, pad + 30, cw, ch, 1 - P.shieldCD / BAL.shieldCD, 'ШЛЯПКА S', '#ffe9a8');
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

function drawCooldown(c, x, y, w, h, p, label, color) {
  c.fillStyle = 'rgba(0,0,0,0.38)';
  roundRectPath(c, x, y, w, h, 9); c.fill();
  c.fillStyle = p >= 1 ? color : 'rgba(255,255,255,0.42)';
  roundRectPath(c, x, y, Math.max(3, w * clamp(p, 0, 1)), h, 9); c.fill();
  c.fillStyle = 'rgba(20,20,30,0.92)'; c.font = 'bold 11px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, x + w / 2, y + h / 2 + 1);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
}

// floating score texts
function drawPops(c) {
  if (!pops.length) return;
  c.save();
  // exact conversion: world px -> canvas px -> UI box px
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  for (var i = 0; i < pops.length; i++) {
    var q = pops[i];
    var px = Math.round(OX + q.x * SCALE);
    var py = Math.round(OY + q.y * SCALE);
    c.globalAlpha = clamp(q.life * 1.6, 0, 1);
    c.font = 'bold ' + Math.round(22 * SCALE / US) + 'px system-ui, sans-serif';
    c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineJoin = 'round';
    c.strokeText(q.text, px, py);
    c.fillStyle = q.color; c.fillText(q.text, px, py);
  }
  c.globalAlpha = 1;
  c.restore();
}

// -------------------------------------------------------------------- menus
function drawMenu(c) {
  var W = 960;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';

  c.fillStyle = 'rgba(12,16,34,0.5)';
  roundRectPath(c, W / 2 - 350, 24, 700, 368, 28); c.fill();

  var big = 60;
  c.font = 'bold ' + big + 'px system-ui, sans-serif';
  c.lineWidth = 10; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineJoin = 'round';
  c.strokeText('ГРИБОК', W / 2, 105);
  c.strokeText('против МАРИО', W / 2, 105 + big * 1.02);
  c.fillStyle = '#ffffff'; c.fillText('ГРИБОК', W / 2, 105);
  c.fillStyle = '#ffd34d'; c.fillText('против МАРИО', W / 2, 105 + big * 1.02);

  var small = 19;
  c.font = small + 'px system-ui, sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.95)';
  var raw = (typeof MODE !== 'undefined' && MODE.mode === 'becoming');
  var lines = raw
    ? ['Боб идёт за тобой. Каждая ошибка = +1 стадия ужаса', 'Чистые увороты откатывают его назад — лови CANNY-момент', 'Гравитация и скорость растут вместе со шкалой']
    : ((TOUCHUI)
      ? ['Свайп ← → или кнопки — уворот дэшем', 'Тап — прыжок · кнопка щита — под шляпку', 'Марио прыгает НА тебя. Не дай себя расплющить!']
      : ['← → или A / D — уворот дэшем (есть кулдаун)', '↑ или Space — прыжок · S — спрятаться под шляпку', 'Марио прыгает НА тебя. Не дай себя расплющить!']);
  for (var i = 0; i < lines.length; i++) c.fillText(lines[i], W / 2, 270 + i * 28);

  c.font = 'bold 16px system-ui, sans-serif';
  c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineJoin = 'round';
  c.strokeText('Рекорд: ' + G.best + '   ·   M — звук', W / 2, 356);
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.fillText('Рекорд: ' + G.best + '   ·   M — звук', W / 2, 356);
  c.textAlign = 'left';
}

function drawDead(c) {
  var W = 960;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';

  c.fillStyle = 'rgba(12,16,34,0.6)';
  roundRectPath(c, W / 2 - 320, 66, 640, 366, 28); c.fill();

  c.font = 'bold 48px system-ui, sans-serif';
  c.lineWidth = 9; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineJoin = 'round';
  c.strokeText('ТЕБЯ РАСПЛЮЩИЛИ', W / 2, 148);
  c.fillStyle = '#ff8f7a'; c.fillText('ТЕБЯ РАСПЛЮЩИЛИ', W / 2, 148);

  c.font = 'bold 34px system-ui, sans-serif';
  c.fillStyle = '#fff';
  c.fillText('Очки: ' + Math.floor(G.score), W / 2, 212);
  c.font = '19px system-ui, sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.88)';
  c.fillText('Рекорд: ' + G.best + '   ·   Спор: ' + playerSpores + '   ·   Раунд: ' + G.level, W / 2, 250);
  if (G.bestFlash > 0) {
    c.fillStyle = '#ffd34d'; c.font = 'bold 26px system-ui, sans-serif';
    c.fillText('★ НОВЫЙ РЕКОРД ★', W / 2, 294);
  }
  c.textAlign = 'left';
}

function drawButtons(c) {
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    if (b.id === 'start') {
      c.fillStyle = 'rgba(255,211,77,0.98)';
      roundRectPath(c, b.x, b.y, b.w, b.h, 22); c.fill();
      c.fillStyle = '#3a2a00';
      c.font = 'bold 32px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(G.mode === 'dead' ? 'ЕЩЁ РАЗ' : 'ИГРАТЬ', b.x + b.w / 2, b.y + b.h / 2 + 1);
    } else if (b.id === 'becoming' || b.id === 'baseMode') {
      var on = b.id === 'baseMode';
      c.fillStyle = on ? 'rgba(255,255,255,0.14)' : 'rgba(190,30,30,0.92)';
      roundRectPath(c, b.x, b.y, b.w, b.h, 16); c.fill();
      c.strokeStyle = on ? 'rgba(255,255,255,0.5)' : 'rgba(255,120,120,0.95)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#fff';
      c.font = 'bold 22px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(on ? 'ОБЫЧНЫЙ РЕЖИМ' : 'БОБ ПАРР · BECOMING', b.x + b.w / 2, b.y + b.h / 2 + 1);
    } else if (b.id === 'sound') {
      c.fillStyle = 'rgba(0,0,0,0.4)';
      roundRectPath(c, b.x, b.y, b.w, b.h, 14); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 20px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText((SFXOK && SFX.muted) ? 'OFF' : 'ON', b.x + b.w / 2, b.y + b.h / 2 + 1);
    } else if (G.mode === 'play' && TOUCHUI) {
      var labels = { left: '◀', right: '▶', jump: '⇧', shield: 'Ш' };
      c.fillStyle = 'rgba(255,255,255,0.15)';
      roundRectPath(c, b.x, b.y, b.w, b.h, 18); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.42)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.font = 'bold ' + Math.round(Math.min(b.w, b.h) * 0.5) + 'px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(labels[b.id] || '', b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
  }
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

function drawBanners(c) {
  var W = 960, H = 540;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  if (G.bannerT > 0) {
    c.globalAlpha = clamp(G.bannerT / 0.5, 0, 1);
    c.font = 'bold 34px system-ui, sans-serif';
    c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineJoin = 'round';
    c.strokeText(G.banner, W / 2, 190);
    c.fillStyle = '#fff'; c.fillText(G.banner, W / 2, 190);
    c.globalAlpha = 1;
  }
  if (G.toastT > 0) {
    c.globalAlpha = clamp(G.toastT, 0, 1);
    c.font = 'bold 19px system-ui, sans-serif';
    var w = c.measureText(G.toast).width + 34;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    roundRectPath(c, W / 2 - w / 2, H - 84, w, 42, 13); c.fill();
    c.fillStyle = '#fff'; c.fillText(G.toast, W / 2, H - 55);
    c.globalAlpha = 1;
  }
  c.textAlign = 'left';
}

// -------------------------------------------------------------------- loop
var last = performance.now();
function frame(now) {
  var dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  try { update(dt); draw(); } catch (e) { if (window.console) console.error(e); }
  requestAnimationFrame(frame);
}

resize();
buildButtons();
requestAnimationFrame(frame);
