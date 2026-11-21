/**
 * RGBA の画素列のうち、透明になった画素の割合を返します。
 * 全画素を数えると重いので、step 画素ごとに間引いて数えます。
 */
export function clearedRatio(data: ArrayLike<number>, step = 8): number {
  const pixels = Math.floor(data.length / 4);
  if (pixels === 0) return 0;
  let sampled = 0;
  let cleared = 0;
  for (let i = 0; i < pixels; i += step) {
    sampled++;
    if ((data[i * 4 + 3] ?? 255) < 32) cleared++;
  }
  return cleared / sampled;
}

export interface ScratchOptions {
  /** この割合（0〜1）まで削ったら、残りを自動でめくります */
  readonly threshold?: number;
  /** 指の太さ（CSS ピクセル） */
  readonly brush?: number;
  readonly onProgress?: (ratio: number) => void;
  readonly onScratch?: () => void;
  readonly onDone?: () => void;
}

/** canvas に銀色の膜を描き、指やマウスでこすると削れるようにします。 */
export class ScratchCard {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #opts: Required<Omit<ScratchOptions, "onProgress" | "onScratch" | "onDone">> &
    ScratchOptions;
  #last: { x: number; y: number } | null = null;
  #moves = 0;
  #done = false;
  readonly #abort = new AbortController();

  constructor(canvas: HTMLCanvasElement, options: ScratchOptions = {}) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) throw new Error("canvas 2D が使えません");
    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#opts = { threshold: 0.5, brush: 26, ...options };
    this.#paint();
    this.#bind();
  }

  /** 残りをまとめてめくります。 */
  reveal(): void {
    if (this.#done) return;
    this.#done = true;
    this.#canvas.classList.add("is-cleared");
    this.#opts.onProgress?.(1);
    this.#opts.onDone?.();
    this.#abort.abort();
  }

  destroy(): void {
    this.#abort.abort();
  }

  #paint(): void {
    const canvas = this.#canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.classList.remove("is-cleared");
    const ctx = this.#ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    const w = rect.width;
    const h = rect.height;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#c9ced6");
    grad.addColorStop(0.45, "#eef1f5");
    grad.addColorStop(0.55, "#b4bac4");
    grad.addColorStop(1, "#d9dde4");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 細かい模様で「削れる膜」らしさを出す
    ctx.fillStyle = "rgb(255 255 255 / 0.35)";
    for (let y = 6; y < h; y += 14) {
      for (let x = (y / 14) % 2 === 0 ? 6 : 13; x < w; x += 14) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#7a818d";
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.13)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ここをこすってね", w / 2, h / 2);

    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = this.#opts.brush;
  }

  #bind(): void {
    const canvas = this.#canvas;
    const signal = this.#abort.signal;
    const point = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        canvas.setPointerCapture(e.pointerId);
        this.#last = point(e);
        this.#stroke(this.#last);
      },
      { signal },
    );
    canvas.addEventListener(
      "pointermove",
      (e) => {
        if (this.#last === null) return;
        // 速くこすったときも途切れないよう、取りこぼしたイベントも使う
        const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
        for (const ev of events.length > 0 ? events : [e]) this.#stroke(point(ev));
      },
      { signal },
    );
    const end = () => {
      this.#last = null;
      this.#check();
    };
    canvas.addEventListener("pointerup", end, { signal });
    canvas.addEventListener("pointercancel", end, { signal });
  }

  #stroke(p: { x: number; y: number }): void {
    const ctx = this.#ctx;
    const from = this.#last ?? p;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    this.#last = p;
    this.#opts.onScratch?.();
    if (++this.#moves % 12 === 0) this.#check();
  }

  #check(): void {
    if (this.#done) return;
    const { width, height } = this.#canvas;
    const ratio = clearedRatio(this.#ctx.getImageData(0, 0, width, height).data, 16);
    this.#opts.onProgress?.(ratio);
    if (ratio >= this.#opts.threshold) this.reveal();
  }
}
