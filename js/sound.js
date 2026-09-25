// 効果音（Web Audio でその場で合成するので音声ファイルは不要）
import { settings } from './store.js';

let ctx = null, master = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  master.gain.value = settings().volume ?? 0.7;
  return ctx;
}

// iOS Safari はユーザー操作の中で一度鳴らさないと音が出ない
export function unlock() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b; s.connect(master); s.start(0);
}
['pointerdown', 'touchend', 'keydown'].forEach((ev) =>
  addEventListener(ev, function once() { unlock(); removeEventListener(ev, once, true); }, true));

const on = () => settings().sound && ac();

function tone(freq, start, dur, { type = 'sine', vol = 0.3, attack = 0.005, release, detune = 0, slideTo } = {}) {
  const c = ctx;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  o.detune.value = detune;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (release ?? dur));
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + (release ?? dur) + 0.05);
}

function noise(start, dur, { vol = 0.2, freq = 1200, q = 0.8, type = 'bandpass' } = {}) {
  const c = ctx;
  const t0 = c.currentTime + start;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
}

// 鐘のような音（倍音を重ねる）
function bell(freq, start, dur = 1.2, vol = 0.22) {
  tone(freq, start, dur, { type: 'sine', vol, release: dur });
  tone(freq * 2.01, start, dur * 0.6, { type: 'sine', vol: vol * 0.35, release: dur * 0.6 });
  tone(freq * 3.02, start, dur * 0.3, { type: 'sine', vol: vol * 0.15, release: dur * 0.3 });
}

const semi = (base, n) => base * Math.pow(2, n / 12);

export const sfx = {
  tap() { if (!on()) return; tone(1100, 0, 0.05, { type: 'triangle', vol: 0.08 }); },
  select() { if (!on()) return; tone(660, 0, 0.07, { type: 'triangle', vol: 0.12 }); tone(990, 0.04, 0.08, { type: 'triangle', vol: 0.08 }); },
  pen() { if (!on()) return; noise(0, 0.05, { vol: 0.035, freq: 3200, q: 0.6 }); },
  // 正解：コンボが続くほど音程が上がる
  correct(combo = 0) {
    if (!on()) return;
    const up = Math.min(combo, 12);
    bell(semi(1046.5, up), 0, 0.7, 0.2);
    bell(semi(1568, up), 0.09, 1.0, 0.2);
  },
  wrong() {
    if (!on()) return;
    tone(220, 0, 0.18, { type: 'square', vol: 0.07, slideTo: 180 });
    tone(165, 0.16, 0.3, { type: 'square', vol: 0.07, slideTo: 130 });
  },
  combo(n) {
    if (!on()) return;
    const notes = [0, 4, 7, 12, 16];
    notes.forEach((s, i) => tone(semi(784, s + Math.min(n, 20) / 5), i * 0.055, 0.2, { type: 'triangle', vol: 0.12 }));
  },
  // はんこを押す音
  stamp() {
    if (!on()) return;
    tone(140, 0, 0.18, { type: 'sine', vol: 0.5, slideTo: 60 });
    noise(0, 0.08, { vol: 0.25, freq: 600, q: 0.5 });
  },
  xp() { if (!on()) return; tone(1760, 0, 0.06, { type: 'sine', vol: 0.06 }); tone(2349, 0.05, 0.08, { type: 'sine', vol: 0.05 }); },
  levelup() {
    if (!on()) return;
    const seq = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.64]];
    seq.forEach(([f, t]) => { tone(f, t, 0.35, { type: 'triangle', vol: 0.16 }); tone(f / 2, t, 0.35, { type: 'sine', vol: 0.1 }); });
    bell(2093, 0.78, 1.5, 0.15);
  },
  badge() {
    if (!on()) return;
    [0, 0.07, 0.14, 0.21, 0.28].forEach((t, i) => bell(semi(1318, [0, 3, 7, 10, 12][i]), t, 0.6, 0.1));
  },
  // 和太鼓
  taiko(times = 1) {
    if (!on()) return;
    for (let i = 0; i < times; i++) {
      tone(110, i * 0.28, 0.5, { type: 'sine', vol: 0.6, slideTo: 55 });
      noise(i * 0.28, 0.12, { vol: 0.2, freq: 300, q: 0.7 });
    }
  },
  tick() { if (!on()) return; tone(1500, 0, 0.03, { type: 'square', vol: 0.03 }); },
  finish() {
    if (!on()) return;
    [[784, 0], [988, 0.1], [1175, 0.2], [1568, 0.34]].forEach(([f, t]) => bell(f, t, 0.9, 0.14));
  },
  // 合格ファンファーレ
  pass() {
    if (!on()) return;
    this.taiko(2);
    const m = [[523, 0.6], [523, 0.75], [523, 0.9], [659, 1.05], [784, 1.3], [659, 1.55], [784, 1.7], [1047, 1.95]];
    m.forEach(([f, t]) => { tone(f, t, 0.3, { type: 'sawtooth', vol: 0.05 }); tone(f, t, 0.3, { type: 'triangle', vol: 0.12 }); });
    bell(2093, 2.2, 2, 0.15);
  },
  fail() {
    if (!on()) return;
    [[392, 0], [349, 0.25], [330, 0.5], [262, 0.8]].forEach(([f, t]) => tone(f, t, 0.4, { type: 'triangle', vol: 0.12 }));
  },
};
