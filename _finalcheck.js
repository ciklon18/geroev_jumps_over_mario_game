const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process'), os = require('os');
const ROOT = __dirname;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f).toLowerCase();
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(9100, r));
  const prof = path.join(os.tmpdir(), 'fin' + Date.now());
  const ch = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--remote-debugging-port=9690', '--user-data-dir=' + prof, '--window-size=1264,705', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let t; for (let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:9690/json/list'); t = await r.json(); if (t.length) break; } catch (e) { } await sleep(250); }
  const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:9100/index.html?v=' + Date.now() }); await sleep(2500);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.exceptionDetails) return 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 200); return r.result ? r.result.value : 'null'; };
  const shot = async n => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(n, Buffer.from(s.data, 'base64')); };

  console.log('1 music:', await ev("JSON.stringify({dur: SAMPLES.meme_full.duration, ready: SAMPLES.meme_full.readyState})"));
  console.log('2 constants:', await ev("JSON.stringify({BAL: typeof BAL, shieldCD: BAL.shieldCD, dashTouch: BAL.dashCDTouch})"));
  console.log('3 reduced-motion flag:', await ev("typeof REDUCED + ':' + REDUCED"));

  // 60 s of stepped simulation for errors + performance
  await ev('startBecoming(); STORY.on=false; P.iframe = 999; setInterval(function(){ P.iframe = Math.max(P.iframe, 1); }, 100);');
  const perf = await ev(`(function(){
    var t0 = performance.now(), n = 0;
    for (var i = 0; i < 1800; i++) { update(1/60); draw(); n++; }
    return JSON.stringify({frames: n, ms: Math.round(performance.now() - t0), perFrame: +((performance.now() - t0)/n).toFixed(2)});
  })()`);
  console.log('4 perf (1800 frames):', perf);
  await sleep(800);
  await shot('_final.png');
  console.log('5 errors:', errs.length ? errs.slice(0, 2) : 0);
  ch.kill(); server.close(); setTimeout(() => process.exit(0), 300);
})();