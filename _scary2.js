const fs = require('fs');
let t = fs.readFileSync('becoming.js', 'utf8');
const miss = [];
function rep(a, b) { if (t.includes(a)) t = t.split(a).join(b); else miss.push(a.slice(0, 60)); }

// much stronger horror from the first stage
rep("  var vig = Math.min(0.78, 0.30 + st * 0.09);", "  var vig = Math.min(0.85, 0.40 + st * 0.09);");
rep("  var gray = Math.min(0.30, 0.10 + st * 0.05);", "  var gray = Math.min(0.40, 0.22 + st * 0.05);");
rep("  var dark = Math.min(0.42, 0.10 + st * 0.07);", "  var dark = Math.min(0.55, 0.22 + st * 0.07);");
fs.writeFileSync('becoming.js', t, 'utf8');

let s = fs.readFileSync('sfx.js', 'utf8');
// a stinger for the moment the world turns
if (!s.includes('stinger:')) {
  s = s.replace("    select: function ()", `    // the world turns dark: a dissonant swell
    stinger: function () {
      slide(90, 42, 0, 0.9, 'sawtooth', 0.10);
      tone({ t0: 0.05, f0: 311, f1: 294, type: 'square', dur: 0.8, vol: 0.05 });
      tone({ t0: 0.1, f0: 233, f1: 220, type: 'square', dur: 0.8, vol: 0.05 });
      swoosh(0, 0.7, 300, 60, 0.12);
    },
    select: function ()`);
  fs.writeFileSync('sfx.js', s, 'utf8');
}
console.log('missing:', miss.length ? miss : 'none');