/**
 * 程序化音乐：没有音频文件，用 WebAudio 现场合成两首循环
 *  - field  大地图：五声音阶长笛，慢，带一点空旷感
 *  - battle 遭遇战：鼓点 + 低音，紧
 * 环境不支持 WebAudio 时静默，不影响游戏。
 */

const SCALE = [
  293.66, 329.63, 369.99, 440.0, 523.25,
  587.33, 659.26, 739.99, 880.0,
];

const S = {
  ctx: null,
  tried: false,
  mode: null,
  t: 0,
  nextNote: 0,
  beat: 0,
  enabled: true,
  master: null,
};

function storageGet(key) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) return wx.getStorageSync(key);
    if (typeof tt !== 'undefined' && tt.getStorageSync) return tt.getStorageSync(key);
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch (e) { /* ignore */ }
  return null;
}

function storageSet(key, val) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) return wx.setStorageSync(key, val);
    if (typeof tt !== 'undefined' && tt.setStorageSync) return tt.setStorageSync(key, val);
    if (typeof localStorage !== 'undefined') return localStorage.setItem(key, val);
  } catch (e) { /* ignore */ }
}

function createCtx() {
  if (S.tried) return S.ctx;
  S.tried = true;
  let Ctor = null;
  if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
    Ctor = window.AudioContext || window.webkitAudioContext;
    S.ctx = new Ctor();
  } else if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
    S.ctx = wx.createWebAudioContext();
  } else if (typeof tt !== 'undefined' && tt.createWebAudioContext) {
    S.ctx = tt.createWebAudioContext();
  }
  if (S.ctx) {
    try {
      S.master = S.ctx.createGain();
      S.master.gain.value = 0.32;
      S.master.connect(S.ctx.destination);
    } catch (e) {
      S.master = null;
    }
  }
  const saved = storageGet('bw_audio');
  if (saved === 'off' || saved === '0' || saved === false) S.enabled = false;
  return S.ctx;
}

function resume() {
  const ctx = createCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
  } catch (e) { /* ignore */ }
}

function out() {
  return S.master || (S.ctx ? S.ctx.destination : null);
}

function tone(freq, dur, type, gain, delay) {
  const ctx = S.ctx;
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const now = ctx.currentTime + (delay || 0);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.05);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.2), now + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    const dst = out();
    if (dst) g.connect(dst);
    o.start(now);
    o.stop(now + dur + 0.02);
  } catch (e) { /* ignore */ }
}

function noiseHit(dur, gain) {
  const ctx = S.ctx;
  if (!ctx) return;
  try {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer ? ctx.createBuffer(1, len, ctx.sampleRate) : null;
    if (!buf) return;
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    const dst = out();
    if (dst) g.connect(dst);
    src.start();
  } catch (e) { /* ignore */ }
}

function play(mode) {
  if (!createCtx()) return;
  if (S.mode === mode) return;
  S.mode = mode;
  S.t = 0;
  S.beat = 0;
  S.nextNote = 0;
  if (S.ctx && S.ctx.state === 'suspended' && S.ctx.resume) {
    try { S.ctx.resume(); } catch (e) { /* ignore */ }
  }
}

function stop() {
  S.mode = null;
  S.t = 0;
}

function update(dt) {
  if (!S.ctx || !S.enabled || !S.mode) return;
  S.t += dt;

  if (S.mode === 'field') {
    // 每 0.85 秒一个音，旋律在五声音阶里绕
    if (S.t >= S.nextNote) {
      S.nextNote = S.t + 0.85;
      const idx = Math.floor(Math.random() * 5) + (Math.random() < 0.3 ? 4 : 0);
      const f = SCALE[Math.min(SCALE.length - 1, idx)];
      tone(f, 1.1, 'triangle', 0.10);
      if (Math.random() < 0.4) tone(f * 1.5, 0.9, 'sine', 0.05, 0.12);
    }
    return;
  }

  // battle：四拍一小节，拍点 0.42 秒
  const beatLen = 0.42;
  if (S.t >= S.nextNote) {
    S.nextNote = S.t + beatLen;
    S.beat = (S.beat + 1) % 4;
    tone(S.beat === 0 ? 82 : 98, 0.16, 'square', 0.16);
    if (S.beat === 2) noiseHit(0.08, 0.05);
    if (S.beat === 0) tone(174, 0.5, 'sawtooth', 0.05, 0.02);
  }
}

function setEnabled(on) {
  S.enabled = !!on;
  storageSet('bw_audio', S.enabled ? 'on' : 'off');
  if (!S.enabled) stop();
}

function isEnabled() {
  return S.enabled;
}

module.exports = {
  play,
  stop,
  update,
  resume,
  setEnabled,
  isEnabled,
};
