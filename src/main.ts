import "./style.css";
import { cryptoRandomInt, pickIndex } from "./draw.ts";
import { configFromHash } from "./config.ts";
import type { Prize } from "./prizes.ts";
import { ScratchCard } from "./scratch.ts";
import * as sound from "./sound.ts";
import {
  buzz,
  FlipDetector,
  listenMotion,
  requestMotionPermission,
  ShakeDetector,
  type Vec3,
} from "./sensors.ts";

type Step = "start" | "shake" | "mixed" | "flip" | "drop" | "pick" | "chosen" | "scratch" | "result";

/** 逆さにしたときに出てくるくじの枚数 */
const CHOICES = 3;

/** 出てくる 3 枚のくじの色。箱（赤）と見分けやすいよう赤は使わない。中身とは関係ない飾り */
const TICKET_COLORS = ["#2f7fd8", "#22a35a", "#f2b705"] as const;

/** 配列を並べ替えたコピーを返します（Fisher–Yates）。 */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** 何回振ったら混ざったことにするか */
const SHAKES_NEEDED = 10;

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} が見つかりません`);
  return el as T;
}

const app = $("app");
const box = $<HTMLButtonElement>("box");
const message = $("message");
const sub = $("sub");
const gauge = $("gauge");
const gaugeBar = $("gauge-bar");
const startBtn = $<HTMLButtonElement>("start");
const againBtn = $<HTMLButtonElement>("again");
const fallbackBtn = $<HTMLButtonElement>("fallback");
const card = $("card");
const cardNote = $("card-note");
const cardLabel = $("card-label");
const canvas = $<HTMLCanvasElement>("scratch");
const confetti = $("confetti");
const spout = $("spout");
const tickets = Array.from(spout.querySelectorAll<HTMLElement>(".ticket"));
const picks = $("picks");
const pickBtns = Array.from(picks.querySelectorAll<HTMLButtonElement>(".pick"));
const muteBtn = $<HTMLButtonElement>("mute");

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// くじの中身は URL（#c=…）から読む。なければ src/prizes.ts の標準設定
const { config } = configFromHash(window.location.hash);
const PRIZES = config.prizes;
// 同じタブで別の設定の URL を開いたとき（# 以降だけ変わる）は読み直す
window.addEventListener("hashchange", () => window.location.reload());
document.title = config.title;
$("title").textContent = config.title;

let step: Step = "start";
let sensorAlive = false;
let shakes = 0;
let shakeDetector = new ShakeDetector();
let flipDetector = new FlipDetector();
/** くじが出た後、スマホを元の向きに戻したかを見る */
let uprightDetector: FlipDetector | null = null;
let lastGravity: Vec3 | null = null;
let dropTimer = 0;
let scratch: ScratchCard | null = null;
let prize: Prize | null = null;
/** 出てきた 3 枚の中身。選んだ 1 枚が結果になり、残りは最後に見せる */
let candidates: Prize[] = [];
let chosenIndex = -1;
/** 今回の 3 枚の色（毎回並びを変える） */
let ticketColors: string[] = [...TICKET_COLORS];
let stopMotion: (() => void) | null = null;

function setStep(next: Step): void {
  step = next;
  app.dataset["step"] = next;
}

function setText(main: string, detail = ""): void {
  const changed = message.textContent !== main;
  message.textContent = main;
  sub.textContent = detail;
  // 文言が変わるたびに、ポンと弾ませる
  if (changed && !reducedMotion) replay(message, "is-pop");
}

function setGauge(ratio: number): void {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  gaugeBar.style.width = `${pct}%`;
  gauge.setAttribute("aria-valuenow", String(pct));
}

function setFallback(label: string | null): void {
  fallbackBtn.hidden = label === null;
  fallbackBtn.textContent = label ?? "";
}

/** CSS アニメーションを最初から再生し直します。 */
function replay(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function onMotion(g: Vec3, t: number): void {
  sensorAlive = true;
  lastGravity = g;
  if (step === "shake" && shakeDetector.push(g, t)) {
    addShake();
  } else if (step === "flip" && flipDetector.push(g, t)) {
    dropTicket(true);
  } else if (step === "drop" && uprightDetector?.push(g, t)) {
    goPick();
  }
}

// ---- 1. 振る ----
function goShake(): void {
  setStep("shake");
  shakes = 0;
  shakeDetector = new ShakeDetector();
  setGauge(0);
  card.classList.remove("is-shown");
  confetti.replaceChildren();
  for (const btn of pickBtns) {
    btn.classList.remove("is-chosen", "is-dim");
    btn.disabled = false;
  }
  for (const t of tickets) t.classList.remove("is-dropping");
  prize = null;
  candidates = [];
  chosenIndex = -1;
  scratch?.destroy();
  scratch = null;
  if (sensorAlive) {
    setText("シャカシャカ〜！");
  } else {
    setText("シャカシャカ〜！", "振るか、箱をタップ！");
  }
  setFallback("スキップ ▶");
}

/** 振る工程を飛ばして、混ぜ終わったことにします。 */
function skipShake(): void {
  if (step !== "shake") return;
  setGauge(1);
  setFallback(null);
  setStep("mixed");
  setText("まざった〜！");
  window.setTimeout(goFlip, 400);
}

function addShake(): void {
  if (step !== "shake") return;
  shakes++;
  setGauge(shakes / SHAKES_NEEDED);
  replay(box, shakes % 2 === 0 ? "jolt-l" : "jolt-r");
  if (!reducedMotion) {
    tossPapers();
    shout(shakes);
  }
  sound.rustle();
  buzz(18);
  if (shakes >= SHAKES_NEEDED) {
    setFallback(null);
    setStep("mixed");
    setText("まざった〜！");
    window.setTimeout(goFlip, 700);
  }
}

const SHOUTS = ["シャカ", "シャカッ", "ガサッ", "ガサガサ"];

/** 穴からくじが跳ねて、また落ちていく飾りを出します。 */
function tossPapers(): void {
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    bit.className = "bit";
    const color = PRIZES[Math.floor(Math.random() * PRIZES.length)]?.color ?? "#d4302b";
    bit.style.setProperty("--tint", color);
    bit.style.setProperty("--dx", `${Math.round(Math.random() * 120 - 60)}px`);
    bit.style.setProperty("--up", `${Math.round(50 + Math.random() * 60)}px`);
    bit.style.setProperty("--rot", `${Math.round(Math.random() * 540 - 270)}deg`);
    bit.style.setProperty("--dur", `${(0.45 + Math.random() * 0.2).toFixed(2)}s`);
    bit.addEventListener("animationend", () => bit.remove());
    spout.append(bit);
  }
}

/** 「シャカ」などの擬音を箱のまわりに出します。 */
function shout(n: number): void {
  const word = document.createElement("span");
  word.className = "shout";
  word.textContent = SHOUTS[Math.floor(Math.random() * SHOUTS.length)] ?? "シャカ";
  const left = n % 2 === 0;
  // 箱の外側の左右に出す（箱の上に重なると読みにくいため）
  word.style.setProperty("--x", left ? "auto" : `${92 + Math.random() * 6}%`);
  word.style.setProperty("--rx", left ? `${92 + Math.random() * 6}%` : "auto");
  word.style.setProperty("--y", `${5 + Math.random() * 30}%`);
  word.style.setProperty("--rot", `${left ? -14 : 14}deg`);
  word.addEventListener("animationend", () => word.remove());
  $("box-wrap").append(word);
}

// ---- 2. 逆さにして出す ----
function goFlip(): void {
  setStep("flip");
  flipDetector = new FlipDetector();
  setText("えいっ！ 逆さにしちゃえ！");
  setFallback("スキップ ▶");
}

function dropTicket(bySensor = false): void {
  if (step !== "flip") return;
  // 3 枚の中身はこの瞬間に決まる。1 枚ずつ独立に抽選するので、どれを選んでも確率は同じ
  candidates = Array.from({ length: CHOICES }, () => PRIZES[pickIndex(PRIZES)]).filter(
    (p): p is Prize => p !== undefined,
  );
  // 色の並びは毎回ランダム
  ticketColors = shuffled(TICKET_COLORS);
  tickets.forEach((t, i) => t.style.setProperty("--tc", ticketColors[i] ?? TICKET_COLORS[0]));
  pickBtns.forEach((b, i) => b.style.setProperty("--tc", ticketColors[i] ?? TICKET_COLORS[0]));
  setStep("drop");
  setFallback(null);
  // 画面の中の箱は回さない。スマホを逆さにしていれば、画面上の「上」が実際の「下」になるので、
  // くじが穴から画面の上へ出ていく動きが、そのまま「落ちてくる」ように見える
  for (const t of tickets) replay(t, "is-dropping");
  sound.pop();
  window.setTimeout(sound.pop, 120);
  window.setTimeout(sound.pop, 240);
  buzz([30, 40, 30, 40, 30]);

  window.clearTimeout(dropTimer);
  if (bySensor && lastGravity !== null) {
    setText("ポポポンッ！ 3 枚出た〜！", "もとに戻して〜");
    // 今の（逆さの）向きを基準にして、元に戻したら次へ進む
    uprightDetector = new FlipDetector(150, 1);
    uprightDetector.push(lastGravity, 0);
    // 戻したことを検知できなくても、しばらくしたら進める
    dropTimer = window.setTimeout(goPick, 4000);
  } else {
    uprightDetector = null;
    setText("ポポポンッ！ 3 枚出た〜！");
    dropTimer = window.setTimeout(goPick, reducedMotion ? 200 : 1400);
  }
}

// ---- 3. 選ぶ ----
function goPick(): void {
  if (step !== "drop") return;
  window.clearTimeout(dropTimer);
  uprightDetector = null;
  setStep("pick");
  for (const t of tickets) t.classList.remove("is-dropping");
  setText("どれにする〜？");
}

function choose(index: number): void {
  if (step !== "pick") return;
  const picked = candidates[index];
  if (picked === undefined) return;
  chosenIndex = index;
  prize = picked;
  setStep("chosen");
  pickBtns.forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.toggle("is-chosen", i === index);
    btn.classList.toggle("is-dim", i !== index);
  });
  setText("これに決めた！");
  sound.pop();
  buzz(30);
  window.setTimeout(goScratch, reducedMotion ? 100 : 650);
}

// ---- 4. こすってめくる ----
function goScratch(): void {
  if (prize === null || step !== "chosen") return;
  setStep("scratch");
  cardNote.textContent = prize.note ?? "";
  cardLabel.textContent = prize.label;
  card.style.setProperty("--tint", prize.color);
  // カードの枠は選んだくじの色にする
  card.style.setProperty("--tc", ticketColors[chosenIndex] ?? prize.color);
  card.classList.add("is-shown");
  setGauge(0);
  setText("ゴシゴシ〜！ めくっちゃえ！");
  setFallback("いっきにめくる ▶");

  // カードの表示が終わってから膜を描く（大きさを正しく測るため）
  requestAnimationFrame(() => {
    scratch?.destroy();
    let lastBuzz = 0;
    scratch = new ScratchCard(canvas, {
      threshold: 0.5,
      onProgress: (r) => setGauge(r / 0.5),
      onScratch: () => {
        const now = performance.now();
        if (now - lastBuzz > 90) {
          buzz(4);
          lastBuzz = now;
        }
      },
      onDone: showResult,
    });
  });
}

function showResult(): void {
  if (prize === null || step === "result") return;
  setStep("result");
  setFallback(null);
  setGauge(1);
  if (prize.celebrate) setText(`🎉 ${prize.label}！ 🎉`, "おめでとう〜！");
  else setText(`${prize.label}…！`, prize.note ?? "");
  buzz(prize.celebrate ? [60, 40, 60, 40, 120] : 40);
  if (prize.celebrate) sound.fanfare();
  else sound.plain();
  if (prize.celebrate && !reducedMotion) burst(prize.color);
}

function burst(color: string): void {
  const colors = [color, "#ffd23f", "#3ec1d3", "#ff6f91", "#7bd389"];
  const pieces = Array.from({ length: 48 }, (_, i) => {
    const s = document.createElement("span");
    s.style.setProperty("--x", `${Math.random() * 100}%`);
    s.style.setProperty("--d", `${(Math.random() * 0.6).toFixed(2)}s`);
    s.style.setProperty("--r", `${Math.round(Math.random() * 720 - 360)}deg`);
    s.style.setProperty("--c", colors[i % colors.length] ?? color);
    return s;
  });
  confetti.replaceChildren(...pieces);
}

// ---- ボタン ----
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  sound.unlock();
  // iOS では、タップの処理の中で許可を求める必要がある
  const permission = await requestMotionPermission();
  // ブラウザによって許可の返し方がまちまちなので、結果に関係なく購読し、
  // 実際に値が届いたかどうかで「センサーが使えるか」を判断する
  stopMotion ??= listenMotion(onMotion);
  startBtn.disabled = false;
  goShake();
  if (permission === "denied") {
    setText("シャカシャカ〜！", "箱をタップ！");
  }
  // PC などセンサーのない端末では、しばらく待っても値が来ない
  window.setTimeout(() => {
    if (!sensorAlive && step === "shake") {
      setText("シャカシャカ〜！", "箱をタップ！");
    }
  }, 1500);
});

box.addEventListener("click", () => {
  if (step === "shake") addShake();
});

pickBtns.forEach((btn, i) => {
  btn.addEventListener("click", () => choose(i));
});

function renderMute(): void {
  const m = sound.isMuted();
  muteBtn.textContent = m ? "音：オフ" : "音：オン";
  muteBtn.setAttribute("aria-pressed", String(!m));
}

muteBtn.addEventListener("click", () => {
  sound.unlock();
  sound.setMuted(!sound.isMuted());
  renderMute();
});
renderMute();

fallbackBtn.addEventListener("click", () => {
  if (step === "shake") skipShake();
  else if (step === "flip") dropTicket();
  else if (step === "scratch") scratch?.reveal();
});

againBtn.addEventListener("click", () => {
  sound.unlock();
  goShake();
});

setFallback(null);
