// Find the loudest transient in the clip: that is the scream / jumpscare moment.
const { execFileSync } = require('child_process');
const fs = require('fs');

const input = '_audio/sound.mp3';
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { maxBuffer: 200e6 });
const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
const SR = 16000, WIN = SR / 10;   // 100 ms windows

const en = [];
for (let i = 0; i < samples.length; i += WIN) {
  let s = 0;
  for (let j = i; j < Math.min(i + WIN, samples.length); j++) s += samples[j] * samples[j];
  en.push(Math.sqrt(s / WIN));
}
let peak = 0, peakIdx = 0;
for (let i = 0; i < en.length; i++) if (en[i] > peak) { peak = en[i]; peakIdx = i; }

// ranking of the loudest windows
const ranked = en.map((v, i) => ({ t: +(i / 10).toFixed(1), v: Math.round(v) }))
  .sort((a, b) => b.v - a.v).slice(0, 12);

console.log('peak at', (peakIdx / 10).toFixed(1), 's, level', Math.round(peak));
console.log('top windows:', JSON.stringify(ranked));
fs.writeFileSync('_audio/peaks.json', JSON.stringify({ peak: peakIdx / 10, ranked }, null, 1));