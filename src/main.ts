import "./style.css";
import { pickIndex } from "./draw.ts";
import { PRIZES, type Prize, TITLE } from "./prizes.ts";
import { ScratchCard } from "./scratch.ts";
import {
  buzz,
  FlipDetector,
  listenMotion,
  requestMotionPermission,
  ShakeDetector,
  type Vec3,
} from "./sensors.ts";

type Step = "start" | "shake" | "flip" | "drop" | "scratch" | "result";

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
const ticket = $("ticket");

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

document.title = TITLE;
$("title").textContent = TITLE;

let step: Step = "start";
let sensorAlive = false;
let shakes = 0;
let shakeDetector = new ShakeDetector();
let flipDetector = new FlipDetector();
let scratch: ScratchCard | null = null;
let prize: Prize | null = null;
let stopMotion: (() => void) | null = null;

function setStep(next: Step): void {
  step = next;
  app.dataset["step"] = next;
}

function setText(main: string, detail = ""): void {
  message.textContent = main;
  sub.textContent = detail;
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
  if (step === "shake" && shakeDetector.push(g, t)) {
    addShake();
  } else if (step === "flip" && flipDetector.push(g, t)) {
    dropTicket();
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
  scratch?.destroy();
  scratch = null;
  if (sensorAlive) {
    setText("スマホを振って、くじを混ぜてね", "シャカシャカ振るとゲージがたまります");
  } else {
    setText("スマホを振って、くじを混ぜてね", "振っても反応しないときは、箱をタップしてください");
  }
  setFallback(null);
}

function addShake(): void {
  if (step !== "shake") return;
  shakes++;
  setGauge(shakes / SHAKES_NEEDED);
  replay(box, shakes % 2 === 0 ? "jolt-l" : "jolt-r");
  buzz(18);
  if (shakes >= SHAKES_NEEDED) {
    setStep("drop");
    setText("よく混ざりました！");
    window.setTimeout(goFlip, 500);
  }
}

// ---- 2. 逆さにして出す ----
function goFlip(): void {
  setStep("flip");
  flipDetector = new FlipDetector();
  setText(
    "スマホを逆さにして、くじを 1 枚出してね",
    "画面の自動回転をオフにしておくと見やすいです",
  );
  setFallback("逆さにできないときはこちら");
}

function dropTicket(): void {
  if (step !== "flip") return;
  // くじはこの瞬間に決まる
  const index = pickIndex(PRIZES);
  prize = PRIZES[index] ?? null;
  setStep("drop");
  setFallback(null);
  setText("ポトッ…", "くじが 1 枚出てきました");
  if (prize !== null) ticket.style.setProperty("--tint", prize.color);
  replay(ticket, "is-dropping");
  buzz([30, 60, 30]);
  window.setTimeout(goScratch, reducedMotion ? 200 : 1500);
}

// ---- 3. こすってめくる ----
function goScratch(): void {
  if (prize === null) return;
  setStep("scratch");
  ticket.classList.remove("is-dropping");
  cardNote.textContent = prize.note ?? "";
  cardLabel.textContent = prize.label;
  card.style.setProperty("--tint", prize.color);
  card.classList.add("is-shown");
  setGauge(0);
  setText("指でこすって、めくってね", "半分くらい削ると全部めくれます");
  setFallback("まとめてめくる");

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
  setText(`${prize.label}！`, prize.note ?? "");
  buzz(prize.celebrate ? [60, 40, 60, 40, 120] : 40);
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
  // iOS では、タップの処理の中で許可を求める必要がある
  const permission = await requestMotionPermission();
  // ブラウザによって許可の返し方がまちまちなので、結果に関係なく購読し、
  // 実際に値が届いたかどうかで「センサーが使えるか」を判断する
  stopMotion ??= listenMotion(onMotion);
  startBtn.disabled = false;
  goShake();
  if (permission === "denied") {
    setText("センサーが許可されなかったため、タップで進めます", "箱をタップしてくじを混ぜてください");
  }
  // PC などセンサーのない端末では、しばらく待っても値が来ない
  window.setTimeout(() => {
    if (!sensorAlive && step === "shake") {
      setText("箱をタップして、くじを混ぜてね", "この端末ではモーションセンサーが使えないようです");
    }
  }, 1500);
});

box.addEventListener("click", () => {
  if (step === "shake") addShake();
});

fallbackBtn.addEventListener("click", () => {
  if (step === "flip") dropTicket();
  else if (step === "scratch") scratch?.reveal();
});

againBtn.addEventListener("click", goShake);

setFallback(null);
