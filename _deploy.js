const { execSync } = require('child_process');
const fs = require('fs');
const path = 'D:/antigravity/any/mushroom-game';

// bump service worker version
let w = fs.readFileSync(path + '/sw.js', 'utf8');
const m = w.match(/VERSION = 'v(\d+)'/);
const v = m ? parseInt(m[1], 10) + 1 : 1;
w = w.replace(/VERSION = 'v\d+'/, "VERSION = 'v" + v + "'");
fs.writeFileSync(path + '/sw.js', w, 'utf8');
console.log('sw bumped to v' + v);

// commit + push using the stored gh credential
function run(cmd, opts) {
  try { return execSync(cmd, Object.assign({ cwd: path, stdio: 'pipe' }, opts || {})).toString(); }
  catch (e) { return 'ERR ' + (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : e.message); }
}
const cred = execSync('git credential fill', {
  cwd: path,
  input: 'protocol=https\nhost=github.com\n\n',
  stdio: ['pipe', 'pipe', 'pipe']
}).toString();
const pw = (cred.match(/password=(.*)/) || [])[1];
if (!pw) { console.log('no credential'); process.exit(1); }

console.log(run('git add -A'));
console.log(run('git -c core.pager=cat commit -q -m "Cleanup and perf: drop unused assets, balance constants, cached gradients, grain tile, reduced motion"'));
const url = 'https://x-access-token:' + pw + '@github.com/ciklon18/geroev_jumps_over_mario_game.git';
const push = run('git push "' + url + '"');
console.log(push.includes('ERR') ? push : 'pushed');