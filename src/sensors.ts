/** 端末座標系の 3 次元ベクトルです（単位 m/s²）。 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 加速度の急な変化を「1 回振った」として数えます。
 * 連続するサンプル間の差（各軸の絶対値の和）がしきい値を超えたら 1 回とし、
 * 1 回の振りで何度も数えないよう、少し間を空けます。
 */
export class ShakeDetector {
  #last: Vec3 | null = null;
  #lastHit = Number.NEGATIVE_INFINITY;

  constructor(
    readonly threshold = 18,
    readonly cooldownMs = 160,
  ) {}

  /** 振ったと判定したら true を返します。 */
  push(v: Vec3, t: number): boolean {
    const last = this.#last;
    this.#last = v;
    if (last === null) return false;
    const delta = Math.abs(v.x - last.x) + Math.abs(v.y - last.y) + Math.abs(v.z - last.z);
    if (delta < this.threshold || t - this.#lastHit < this.cooldownMs) return false;
    this.#lastHit = t;
    return true;
  }
}

/**
 * 端末を上下逆さにしたことを検知します。
 *
 * 重力の y 成分（画面の縦方向）の符号が、最初に持っていた向きと反対になり、
 * その状態が holdMs 続いたら「逆さ」と判定します。
 * iOS と Android で符号の向きが違っても動くよう、最初の向きを基準にしています。
 */
export class FlipDetector {
  #smooth: Vec3 | null = null;
  #baseline: 1 | -1 | null = null;
  #since: number | null = null;

  constructor(
    readonly holdMs = 250,
    readonly smoothing = 0.25,
  ) {}

  /** 逆さになったと判定したら true を返します。 */
  push(g: Vec3, t: number): boolean {
    const s = this.#smooth;
    const a = this.smoothing;
    const v =
      s === null
        ? g
        : { x: s.x + (g.x - s.x) * a, y: s.y + (g.y - s.y) * a, z: s.z + (g.z - s.z) * a };
    this.#smooth = v;

    if (this.#baseline === null) {
      // 端末を立てて持っているときだけ基準にする（机に置いた状態では決めない）
      if (Math.abs(v.y) < 4) return false;
      this.#baseline = v.y > 0 ? 1 : -1;
      return false;
    }
    const flipped = Math.sign(v.y) === -this.#baseline && Math.abs(v.y) >= 5;
    if (!flipped) {
      this.#since = null;
      return false;
    }
    this.#since ??= t;
    return t - this.#since >= this.holdMs;
  }
}

export type PermissionResult = "granted" | "denied" | "unsupported";

interface PermissionCapable {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * モーションセンサーの利用許可を求めます。
 * iOS Safari ではユーザー操作（タップ）の中で呼ぶ必要があります。
 * 許可の仕組みがないブラウザ（Android など）では、そのまま "granted" を返します。
 */
export async function requestMotionPermission(): Promise<PermissionResult> {
  if (typeof window === "undefined" || typeof window.DeviceMotionEvent === "undefined") {
    return "unsupported";
  }
  const motion = window.DeviceMotionEvent as unknown as PermissionCapable;
  if (typeof motion.requestPermission !== "function") return "granted";
  try {
    return await motion.requestPermission();
  } catch {
    return "denied";
  }
}

/** 重力込みの加速度を受け取ります。戻り値の関数で購読を止めます。 */
export function listenMotion(onSample: (g: Vec3, t: number) => void): () => void {
  const handler = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (a === null || a.x === null || a.y === null || a.z === null) return;
    onSample({ x: a.x, y: a.y, z: a.z }, event.timeStamp);
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

/** 振動できる端末なら振動させます（iOS Safari では何も起きません）。 */
export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 振動できなくても問題ない
  }
}
