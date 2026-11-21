/**
 * Web Audio で簡単な効果音を鳴らします。音声ファイルは使いません。
 * iOS ではユーザー操作の中で unlock() を呼ぶまで音が出ません。
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

const MUTE_KEY = "kuji:muted";

try {
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // 保存できない環境では毎回オンから始める
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // 保存できなくても動作には影響しない
  }
}

/** タップの処理の中で呼び、音を出せる状態にします。 */
export function unlock(): void {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC === undefined) return;
    ctx ??= new AC();
    void ctx.resume();
    if (noise === null) {
      const length = Math.floor(ctx.sampleRate * 0.3);
      noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
  } catch {
    ctx = null;
  }
}

function ready(): AudioContext | null {
  return muted || ctx === null || ctx.state !== "running" ? null : ctx;
}

/** 紙がこすれる「シャカッ」という音です。 */
export function rustle(): void {
  const c = ready();
  if (c === null || noise === null) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.5;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2500 + Math.random() * 2500;
  filter.Q.value = 0.9;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t, Math.random() * 0.1, 0.2);
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType) {
  const c = ready();
  if (c === null) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** くじが出てくる「ポンッ」という音です。 */
export function pop(): void {
  const c = ready();
  if (c === null) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(900, t);
  osc.frequency.exponentialRampToValueAtTime(260, t + 0.18);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.25);
}

/** 当たりのファンファーレです。 */
export function fanfare(): void {
  [523, 659, 784, 1047].forEach((f, i) => {
    tone(f, i * 0.11, i === 3 ? 0.6 : 0.18, 0.18, "triangle");
  });
}

/** はずれなどの、控えめな結果音です。 */
export function plain(): void {
  tone(440, 0, 0.2, 0.15, "triangle");
  tone(330, 0.14, 0.35, 0.15, "triangle");
}
