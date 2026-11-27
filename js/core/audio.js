/**
 * 程序化场景音乐：不加载任何音频文件，全部用 WebAudio 现场合成。
 *
 * 版权说明：旋律、节奏、音色都是本项目按五声音阶即时生成的原创片段，
 * 不采样、不引用任何现存歌曲，因此不存在音乐版权争议。
 *
 * 场景：
 *  - title   标题 / 开局：编钟、古琴、低音鼓，庄重苍凉
 *  - field   大地图：箫、笛、轻鼓，空旷行军
 *  - town    城镇：琵琶、笛、木鱼，市井烟火
 *  - battle  战斗：战鼓、铜锣、低音号，紧张压迫
 *  - tense   宣战 / 史实 / 围城：急促鼓点与不谐和低音
 *  - sorrow  败亡 / 国殇：低音弦、钟，悲凉
 *  - victory 凯旋 / 庆功：鼓乐、号角、琵琶
 *
 * 每个场景有多首曲目，进入场景轮换；单曲循环约 70 秒后自动换下一首。
 * 环境不支持 WebAudio 时静默，不影响游戏。
 */

const SCALE = [
  293.66, 329.63, 369.99, 440.0, 523.25,
  587.33, 659.26, 739.99, 880.0, 987.77,
];
const BASS = [73.42, 87.31, 98.0, 110.0, 130.81, 146.83];
const MODE_ORDER = ['title', 'field', 'town', 'battle', 'tense', 'sorrow', 'victory'];

/**
 * 真实录音：全部来自 OpenGameArt 的 CC0（公共领域）曲目，
 * 可商用、无需署名。文件放在 assets/audio/，加载失败时自动回落到
 * 下面的程序化音乐，不会因为音频缺失卡住游戏。
 */
const AUDIO_FILES = {
  title: 'assets/audio/title_hanmo.mp3',
  field: 'assets/audio/field_xingjun.mp3',
  town: 'assets/audio/title_hanmo.mp3',
  battle: 'assets/audio/battle_zhangu.mp3',
  tense: 'assets/audio/tense_duizhi.mp3',
  sorrow: 'assets/audio/sorrow_guoshang.mp3',
  victory: 'assets/audio/victory_kaixuan.mp3',
};
const AUDIO_FILE_NAMES = {
  title: '汉末风起（实录）',
  field: '千里行军（实录）',
  town: '汉末风起·城镇（实录）',
  battle: '战鼓催阵（实录）',
  tense: '两军对峙（实录）',
  sorrow: '国殇（实录）',
  victory: '凯旋（实录）',
};
const FILE_VOLUME = 0.32;
const FILE_FADE = 0.9;

/**
 * 曲目表：melody 里的数字是 SCALE 下标，-1 表示休止；
 * bass 是 BASS 下标；perc 是每步的打击乐记号（k 大鼓 / s 小鼓 / g 锣 / t 木鱼 / . 休止）。
 */
const TRACKS = [
  {
    id: 'title_hanfeng', mode: 'title', name: '汉末风起', bpm: 50, bars: 8,
    lead: 'flute', melody: [4, -1, 6, 4, 2, -1, 0, -1, 4, -1, 7, 6, 4, -1, 2, -1,
      0, -1, 2, 4, 6, -1, 4, -1, 2, -1, 0, -1, -1, -1, -1, -1],
    bass: [0, 0, 3, 3, 4, 4, 0, 0], bassEvery: 8,
    pad: [[0, 2, 4], [0, 2, 4], [2, 4, 6], [0, 3, 4]], padEvery: 16,
    perc: '..k.....g.......', percGain: 0.06,
  },
  {
    id: 'title_shanhe', mode: 'title', name: '山河旧梦', bpm: 56, bars: 8,
    lead: 'pluck', melody: [2, 4, 6, 4, 2, 0, 2, -1, 4, 6, 7, 6, 4, 2, 0, -1,
      2, 4, 2, 0, -1, 2, 4, 6, 4, -1, 2, 0, -1, -1, -1, -1],
    bass: [0, 0, 2, 2, 3, 3, 2, 0], bassEvery: 8,
    pad: [[0, 2, 4], [2, 4, 6], [0, 2, 4], [3, 5, 7]], padEvery: 16,
    perc: '..t.......t.....', percGain: 0.035,
  },
  {
    id: 'title_qunxiong', mode: 'title', name: '群雄逐鹿', bpm: 72, bars: 8,
    lead: 'saw', melody: [0, -1, 0, 2, 4, -1, 2, 0, -1, -1, 4, 6, 7, 6, 4, 2,
      0, -1, 0, 2, 4, 6, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1],
    bass: [0, 0, 0, 3, 4, 4, 0, 0], bassEvery: 8,
    pad: [[0, 3, 4], [0, 3, 4], [2, 4, 6], [0, 3, 4]], padEvery: 16,
    perc: 'k...s...k.k.s...', percGain: 0.11,
  },
  {
    id: 'field_yewang', mode: 'field', name: '野望', bpm: 58, bars: 8,
    lead: 'flute', melody: [4, -1, 4, 6, -1, 4, 2, 0, -1, 2, 4, -1, 6, 4, -1, -1,
      0, 2, 4, -1, 6, 7, 6, 4, 2, -1, 0, -1, -1, -1, -1, -1],
    bass: [0, 0, 4, 4, 2, 2, 0, 0], bassEvery: 8,
    pad: [[0, 2, 4], [0, 2, 4], [2, 4, 6], [0, 2, 4]], padEvery: 16,
    perc: '..t.......t.....', percGain: 0.03,
  },
  {
    id: 'field_gudao', mode: 'field', name: '古道西风', bpm: 54, bars: 8,
    lead: 'bell', melody: [6, -1, 4, -1, 2, -1, 0, -1, 2, -1, 4, -1, 6, -1, 7, -1,
      6, -1, 4, -1, 2, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    bass: [0, 0, 2, 2, 4, 4, 0, 0], bassEvery: 8,
    pad: [[0, 2, 4], [2, 4, 6], [0, 3, 4], [0, 2, 4]], padEvery: 16,
    perc: '......t.........', percGain: 0.025,
  },
  {
    id: 'field_qianli', mode: 'field', name: '千里行军', bpm: 66, bars: 8,
    lead: 'flute', melody: [2, 4, 6, 4, 2, 4, 6, 7, 6, 4, 2, 4, 6, 4, 2, 0,
      2, 4, 6, 7, 6, 4, 2, 4, 6, -1, 4, 2, 0, -1, -1, -1],
    bass: [0, 0, 2, 2, 3, 3, 4, 4], bassEvery: 8,
    pad: [[0, 2, 4], [2, 4, 6], [0, 3, 4], [0, 2, 4]], padEvery: 16,
    perc: 't...t...t...t...', percGain: 0.04,
  },
  {
    id: 'town_shijing', mode: 'town', name: '市井', bpm: 72, bars: 8,
    lead: 'pluck', melody: [4, 6, 4, 2, 4, -1, 6, 7, 6, 4, 2, 4, 6, 4, 2, 0,
      4, 6, 4, 2, 4, -1, 7, 6, 4, 2, 0, 2, 4, -1, -1, -1],
    bass: [0, 0, 3, 3, 4, 4, 0, 0], bassEvery: 8,
    pad: null, padEvery: 0,
    perc: '..t.....t.......', percGain: 0.02,
  },
  {
    id: 'town_chuiyan', mode: 'town', name: '炊烟', bpm: 72, bars: 8,
    lead: 'flute', melody: [2, -1, 4, 6, -1, 4, 2, 0, 2, -1, 4, -1, 6, 4, 2, -1,
      0, -1, 2, 4, -1, 2, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    bass: [0, 0, 4, 4, 2, 2, 0, 0], bassEvery: 8,
    pad: [[0, 2, 4], [2, 4, 6], [0, 3, 4], [0, 2, 4]], padEvery: 16,
    perc: '..t.....t.......', percGain: 0.022,
  },
  {
    id: 'battle_zhangu', mode: 'battle', name: '战鼓', bpm: 96, bars: 8,
    lead: 'saw', melody: [0, -1, 0, -1, 2, -1, 0, -1, 0, -1, 3, -1, 2, -1, 0, -1,
      0, -1, 0, -1, 2, -1, 4, -1, 3, -1, 2, -1, 0, -1, -1, -1],
    bass: [0, 0, 0, 0, 3, 3, 3, 3], bassEvery: 8,
    pad: null, padEvery: 0,
    perc: 'k.s.k.s.k.s.ksss', percGain: 0.16,
  },
  {
    id: 'battle_tieqi', mode: 'battle', name: '铁骑', bpm: 112, bars: 8,
    lead: 'saw', melody: [4, 6, 4, 2, 4, 6, 7, 6, 4, 2, 0, 2, 4, 6, 4, 2,
      4, 6, 7, 6, 4, 2, 0, -1, 4, 6, 4, 2, 0, -1, -1, -1],
    bass: [0, 0, 4, 4, 2, 2, 0, 0], bassEvery: 4,
    pad: null, padEvery: 0,
    perc: 'kkskkkskkkskkksk', percGain: 0.16,
  },
  {
    id: 'battle_luanjun', mode: 'battle', name: '乱军', bpm: 104, bars: 8,
    lead: 'saw', melody: [0, 4, 2, 7, 4, 0, 6, 2, 0, 4, 2, 7, 4, 0, 6, 2,
      0, -1, 4, -1, 2, -1, 7, -1, 4, -1, 0, -1, -1, -1, -1, -1],
    bass: [0, 0, 3, 3, 2, 2, 0, 0], bassEvery: 4,
    pad: null, padEvery: 0,
    perc: 'k.sgk.sgk.sgk.ssg', percGain: 0.15,
  },
  {
    id: 'tense_zhanzhu', mode: 'tense', name: '战书', bpm: 84, bars: 8,
    lead: 'saw', melody: [0, -1, -1, 0, -1, 2, -1, -1, 0, -1, -1, 3, -1, 2, -1, -1,
      0, -1, -1, 0, -1, 4, -1, 3, 2, -1, 0, -1, -1, -1, -1, -1],
    bass: [0, 0, 0, 0, 3, 3, 2, 2], bassEvery: 8,
    pad: [[0, 3, 4], [0, 3, 4], [0, 2, 4], [0, 3, 4]], padEvery: 16,
    perc: 'k...k...k.k.k...', percGain: 0.12,
  },
  {
    id: 'tense_yexun', mode: 'tense', name: '夜巡', bpm: 70, bars: 8,
    lead: 'pluck', melody: [2, -1, -1, 0, -1, -1, 2, -1, 4, -1, -1, 2, -1, 0, -1, -1,
      2, -1, -1, 0, -1, -1, 4, -1, 2, -1, 0, -1, -1, -1, -1, -1],
    bass: [0, 0, 2, 2, 3, 3, 0, 0], bassEvery: 8,
    pad: [[0, 2, 4], [0, 2, 4], [0, 3, 4], [0, 2, 4]], padEvery: 16,
    perc: '....k.......k...', percGain: 0.055,
  },
  {
    id: 'sorrow_guoshang', mode: 'sorrow', name: '国殇', bpm: 46, bars: 8,
    lead: 'saw', melody: [4, -1, 2, -1, 0, -1, -1, 2, 4, -1, 6, -1, 4, -1, 2, -1,
      0, -1, -1, -1, 2, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    bass: [0, 0, 0, 0, 2, 2, 0, 0], bassEvery: 8,
    pad: [[0, 2, 4], [0, 2, 4], [0, 3, 4], [0, 2, 4]], padEvery: 16,
    perc: '......g.........', percGain: 0.04,
  },
  {
    id: 'sorrow_gucheng', mode: 'sorrow', name: '孤城', bpm: 42, bars: 8,
    lead: 'bell', melody: [0, -1, -1, 2, -1, -1, 4, -1, 2, -1, -1, 0, -1, -1, -1, -1,
      0, -1, -1, 2, -1, -1, 4, -1, 6, -1, 4, -1, 2, -1, -1, -1],
    bass: [0, 0, 2, 2, 0, 0, 0, 0], bassEvery: 8,
    pad: [[0, 3, 4], [0, 3, 4], [0, 2, 4], [0, 3, 4]], padEvery: 16,
    perc: '....g.......g...', percGain: 0.03,
  },
  {
    id: 'victory_kaixuan', mode: 'victory', name: '凯旋', bpm: 100, bars: 8,
    lead: 'saw', melody: [4, 6, 7, 6, 4, 6, 4, 2, 4, 6, 7, 8, 7, 6, 4, 2,
      4, 6, 7, 6, 4, 2, 4, -1, 0, 2, 4, 6, 4, -1, -1, -1],
    bass: [0, 0, 4, 4, 2, 2, 0, 0], bassEvery: 8,
    pad: [[0, 2, 4], [2, 4, 6], [0, 3, 4], [0, 2, 4]], padEvery: 16,
    perc: 'k.s.k.s.k.s.ksss', percGain: 0.14,
  },
  {
    id: 'victory_qinggong', mode: 'victory', name: '庆功', bpm: 108, bars: 8,
    lead: 'pluck', melody: [4, 6, 4, 7, 6, 4, 2, 4, 6, 7, 8, 7, 6, 4, 2, 0,
      4, 6, 4, 7, 6, 4, 2, 4, 6, 8, 7, 6, 4, 2, -1, -1],
    bass: [0, 0, 3, 3, 4, 4, 0, 0], bassEvery: 8,
    pad: null, padEvery: 0,
    perc: 't.k.t.k.t.k.t.ks', percGain: 0.1,
  },
];

const MODES = MODE_ORDER.reduce(function (out, mode) {
  out[mode] = TRACKS.filter(function (t) { return t.mode === mode; });
  return out;
}, {});

const S = {
  ctx: null,
  tried: false,
  mode: null,
  track: null,
  trackTime: 0,
  t: 0,
  nextStep: 0,
  step: 0,
  enabled: true,
  master: null,
  cursor: {},
  // 真实录音播放器：HTMLAudio 或小游戏 InnerAudioContext
  player: null,
  playerKind: null,
  playerTried: false,
  userReady: false,
  lastMode: null,
  fileMode: null,
  filePlaying: false,
  fileVolume: 0,
  fileFailed: false,
  fileFailedMode: null,
  filePending: false,
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
      S.master.gain.value = 0.26;
      S.master.connect(S.ctx.destination);
    } catch (e) {
      S.master = null;
    }
  }
  const saved = storageGet('bw_audio');
  if (saved === 'off' || saved === '0' || saved === false) S.enabled = false;
  return S.ctx;
}

/** 录音加载/播放失败：自动播放限制只算“还没准备好”，换场景时再试。 */
function onFileError(err, mode) {
  const text = String((err && (err.errMsg || err.message || err.name)) || '');
  if (/NotAllowed|not allowed|autoplay|user gesture|interrupted/i.test(text)) {
    S.filePending = true;
    S.filePlaying = false;
    return;
  }
  S.fileFailed = true;
  S.fileFailedMode = mode || S.fileMode;
  S.fileMode = null;
  S.filePlaying = false;
  S.fileVolume = 0;
}

function createPlayer() {
  if (S.playerTried) return S.player;
  S.playerTried = true;
  try {
    if (typeof tt !== 'undefined' && tt.createInnerAudioContext) {
      const p = tt.createInnerAudioContext();
      p.loop = true;
      p.volume = 0;
      if (p.onError) p.onError(function (err) { onFileError(err, S.fileMode); });
      if (p.onEnded) p.onEnded(function () {
        if (S.filePlaying && S.player === p) {
          try { p.play(); } catch (e) { /* ignore */ }
        }
      });
      S.player = p;
      S.playerKind = 'tt';
    } else if (typeof wx !== 'undefined' && wx.createInnerAudioContext) {
      const p = wx.createInnerAudioContext();
      p.loop = true;
      p.volume = 0;
      if (p.onError) p.onError(function (err) { onFileError(err, S.fileMode); });
      if (p.onEnded) p.onEnded(function () {
        if (S.filePlaying && S.player === p) {
          try { p.play(); } catch (e) { /* ignore */ }
        }
      });
      S.player = p;
      S.playerKind = 'wx';
    } else if (typeof Audio !== 'undefined') {
      const p = new Audio();
      p.loop = true;
      p.preload = 'auto';
      p.volume = 0;
      p.onerror = function () { onFileError(null, S.fileMode); };
      p.onended = function () {
        if (S.filePlaying && S.player === p) {
          try { p.currentTime = 0; p.play(); } catch (e) { /* ignore */ }
        }
      };
      S.player = p;
      S.playerKind = 'html';
    }
  } catch (e) {
    S.player = null;
  }
  return S.player;
}

function stopFile() {
  if (S.player) {
    try {
      if (S.player.stop) S.player.stop();
      else if (S.player.pause) S.player.pause();
    } catch (e) { /* ignore */ }
    try { S.player.volume = 0; } catch (e) { /* ignore */ }
  }
  S.fileMode = null;
  S.filePlaying = false;
  S.fileVolume = 0;
}

/** 开始播放某场景的录音；返回 false 表示该场景没有可用录音，交给程序化音乐。 */
function startFile(mode) {
  if (!S.enabled || !AUDIO_FILES[mode]) return false;
  if (S.fileFailedMode === mode) return false;
  if (S.fileMode === mode && S.filePlaying) return true;
  const p = createPlayer();
  if (!p) return false;
  stopFile();
  try {
    p.src = AUDIO_FILES[mode];
    p.loop = true;
    p.volume = 0;
    S.fileMode = mode;
    S.filePlaying = true;
    S.fileVolume = 0;
    S.fileFailed = false;
    S.filePending = false;
    const ret = p.play ? p.play() : null;
    if (ret && ret.catch) ret.catch(function (err) { onFileError(err, mode); });
    return true;
  } catch (e) {
    onFileError(e, mode);
    // 自动播放被拦截时保留 pending，等下一次触摸由 resume() 重试。
    if (S.filePending) return true;
    return false;
  }
}

function resume() {
  S.userReady = true;
  if (!S.enabled) return;
  // 真实录音优先；浏览器/小游戏都要求第一次触摸后才能出声。
  if (S.mode && !S.filePlaying && S.fileFailedMode !== S.mode) {
    startFile(S.mode);
  }
  const ctx = createCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
  } catch (e) { /* ignore */ }
}

function setEnabled(on) {
  const keepMode = S.mode || S.lastMode;
  S.enabled = !!on;
  storageSet('bw_audio', S.enabled ? 'on' : 'off');
  if (!S.enabled) {
    S.lastMode = keepMode;
    stop();
    if (S.master) S.master.gain.value = 0;
  } else {
    if (S.master) S.master.gain.value = 0.26;
    S.mode = keepMode;
    // 用户手动重新打开声音时，允许之前失败过的曲目再试一次。
    S.fileFailed = false;
    S.fileFailedMode = null;
    S.filePending = false;
    resume();
    if (S.mode && !S.filePlaying) startFile(S.mode);
  }
}

function out() {
  return S.master || (S.ctx ? S.ctx.destination : null);
}

function tone(freq, dur, type, gain, delay, opts) {
  const ctx = S.ctx;
  if (!ctx || !freq) return;
  const o = opts || {};
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    if (o.glideTo) {
      const now0 = ctx.currentTime + (delay || 0);
      osc.frequency.setValueAtTime(freq, now0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glideTo), now0 + dur * 0.8);
    }
    const now = ctx.currentTime + (delay || 0);
    const atk = o.attack === undefined ? 0.04 : o.attack;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), now + atk);
    if (o.sustain) g.gain.setValueAtTime(Math.max(0.0002, gain), now + Math.max(atk, dur * 0.55));
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.18), now + dur * 0.82);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    const dst = out();
    if (dst) g.connect(dst);
    // 长局必做：音符播完后断开音频图。旧实现只 stop 不断开，gain 节点
    // 一直挂在 master 上，几十万个节点会把浏览器音频线程拖死，表现成
    // 玩到某个时辰整局卡住。这里断开后让 GC 正常回收。
    osc.onended = function () {
      try { osc.disconnect(); } catch (err) { /* ignore */ }
      try { g.disconnect(); } catch (err) { /* ignore */ }
    };
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch (e) { /* ignore */ }
}

function noiseBurst(dur, gain, filterFreq, delay) {
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
    let node = src;
    let filter = null;
    if (filterFreq && ctx.createBiquadFilter) {
      filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.8;
      src.connect(filter);
      node = filter;
    }
    node.connect(g);
    const dst = out();
    if (dst) g.connect(dst);
    src.onended = function () {
      try { src.disconnect(); } catch (err) { /* ignore */ }
      if (filter) { try { filter.disconnect(); } catch (err) { /* ignore */ } }
      try { g.disconnect(); } catch (err) { /* ignore */ }
    };
    src.start(ctx.currentTime + (delay || 0));
  } catch (e) { /* ignore */ }
}

function playLead(instrument, freq, gain) {
  if (!freq) return;
  if (instrument === 'flute') {
    tone(freq, 1.25, 'triangle', gain * 0.8, 0, { attack: 0.08, sustain: true });
    tone(freq * 2, 0.9, 'sine', gain * 0.18, 0.03, { attack: 0.1 });
  } else if (instrument === 'pluck') {
    tone(freq, 0.55, 'triangle', gain, 0, { attack: 0.006 });
    tone(freq * 2.01, 0.32, 'sine', gain * 0.32, 0.01, { attack: 0.004 });
  } else if (instrument === 'bell') {
    tone(freq, 1.8, 'sine', gain * 0.8, 0, { attack: 0.01 });
    tone(freq * 2.72, 1.2, 'sine', gain * 0.22, 0.01, { attack: 0.01 });
  } else if (instrument === 'saw') {
    tone(freq, 0.9, 'sawtooth', gain * 0.55, 0, { attack: 0.05, sustain: true });
    tone(freq * 0.5, 1.1, 'triangle', gain * 0.22, 0, { attack: 0.06 });
  }
}

function playPad(chord, gain) {
  if (!chord) return;
  chord.forEach(function (idx, i) {
    const f = SCALE[Math.max(0, Math.min(SCALE.length - 1, idx))] * 0.5;
    tone(f, 2.8, 'sine', gain * (i === 0 ? 0.6 : 0.4), i * 0.04, { attack: 0.4, sustain: true });
  });
}

function playPerc(kind, gain) {
  if (kind === 'k') {
    tone(70, 0.26, 'sine', gain * 1.3, 0, { glideTo: 44, attack: 0.004 });
    noiseBurst(0.12, gain * 0.45, 180);
  } else if (kind === 's') {
    noiseBurst(0.09, gain * 0.75, 1200);
  } else if (kind === 'g') {
    noiseBurst(0.65, gain * 0.55, 2600);
    tone(196, 0.9, 'sine', gain * 0.22, 0, { attack: 0.01 });
  } else if (kind === 't') {
    tone(880, 0.08, 'square', gain * 0.35, 0, { attack: 0.002 });
  }
}

function startTrack(track) {
  S.track = track || null;
  S.trackTime = 0;
  S.t = 0;
  S.nextStep = 0;
  S.step = 0;
}

function nextTrack() {
  const mode = S.mode;
  const list = MODES[mode] || [];
  if (!list.length) return;
  const idx = (S.cursor[mode] || 0) % list.length;
  S.cursor[mode] = idx + 1;
  startTrack(list[idx]);
}

function play(mode) {
  if (!MODES[mode]) return;
  if (S.mode === mode && (S.track || S.filePlaying || S.fileMode === mode)) return;
  const changed = S.mode !== mode;
  S.mode = mode;
  S.lastMode = mode;
  if (changed) {
    S.track = null;
    S.trackTime = 0;
    S.t = 0;
    S.step = 0;
    stopFile();
  }
  if (!S.enabled) return;
  // 第一次触摸前不要创建 WebAudio 音符，也不要在移动端偷偷起播。
  if (S.userReady && startFile(mode)) return;
  if (!S.ctx) return;
  if (S.ctx.state === 'suspended' && S.ctx.resume) {
    try { S.ctx.resume(); } catch (e) { /* ignore */ }
  }
  if (S.ctx.state === 'running') nextTrack();
}

function stop() {
  S.mode = null;
  S.track = null;
  S.trackTime = 0;
  S.t = 0;
  stopFile();
}

function update(dt) {
  if (!S.enabled || !S.mode) return;

  // 真实录音：单曲循环，进入场景时从 0 淡入，避免切歌“啪”一声。
  if (S.filePlaying && S.player) {
    S.fileVolume = Math.min(FILE_VOLUME, S.fileVolume + dt * (FILE_VOLUME / FILE_FADE));
    try { S.player.volume = S.fileVolume; } catch (e) { /* ignore */ }
    return;
  }
  // 录音还在等第一次触摸，或已经加载但尚未起播：不要同时叠程序化音乐。
  if (S.fileMode && !S.fileFailed) return;
  if (S.filePending) return;

  if (!S.ctx) return;
  // 浏览器/微信在用户第一次触摸前会把 AudioContext 挂在 suspended；
  // 这时不排音符，否则恢复瞬间会把几十秒的音符一起挤到 0 秒播放。
  if (S.ctx.state && S.ctx.state !== 'running') return;
  if (!S.track) {
    nextTrack();
    return;
  }
  const track = S.track;
  S.t += dt;
  S.trackTime += dt;

  // 单曲循环 70 秒后换同场景下一首，避免长时间听同一段。
  if (S.trackTime > (track.rotateAfter || 70)) {
    nextTrack();
    return;
  }

  const stepLen = 60 / Math.max(30, track.bpm) / 2;
  if (S.t < S.nextStep) return;
  S.nextStep = S.t + stepLen;

  const melody = track.melody || [];
  const step = S.step % Math.max(1, melody.length);
  const note = melody[step];
  if (note !== undefined && note >= 0) {
    playLead(track.lead, SCALE[Math.min(SCALE.length - 1, note)], 0.075);
  }

  const bass = track.bass || [];
  if (bass.length && S.step % (track.bassEvery || 8) === 0) {
    const bi = bass[Math.floor(S.step / (track.bassEvery || 8)) % bass.length];
    tone(BASS[Math.max(0, Math.min(BASS.length - 1, bi))], 1.4, 'triangle', 0.08, 0, { attack: 0.08, sustain: true });
  }

  const pad = track.pad || [];
  if (pad.length && track.padEvery && S.step % track.padEvery === 0) {
    playPad(pad[Math.floor(S.step / track.padEvery) % pad.length], 0.022);
  }

  const perc = track.perc || '';
  if (perc) {
    const kind = perc[step % perc.length];
    if (kind && kind !== '.') playPerc(kind, track.percGain || 0.08);
  }

  S.step += 1;
}

function isEnabled() {
  return S.enabled;
}

function currentTrack() {
  if (S.filePlaying && S.fileMode) {
    return { id: 'file_' + S.fileMode, name: AUDIO_FILE_NAMES[S.fileMode] || S.fileMode, mode: S.fileMode };
  }
  return S.track ? { id: S.track.id, name: S.track.name, mode: S.track.mode } : null;
}

function listMusic() {
  return MODE_ORDER.map(function (mode) {
    const names = [];
    if (AUDIO_FILE_NAMES[mode]) names.push(AUDIO_FILE_NAMES[mode]);
    (MODES[mode] || []).forEach(function (t) { names.push(t.name); });
    return { mode: mode, tracks: names };
  });
}

module.exports = {
  play,
  stop,
  update,
  resume,
  setEnabled,
  isEnabled,
  currentTrack,
  listMusic,
  MODE_ORDER,
  TRACKS,
  AUDIO_FILES,
  AUDIO_FILE_NAMES,
};
