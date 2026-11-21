import { describe, expect, it } from "vitest";
import { FlipDetector, ShakeDetector } from "./sensors.ts";

const upright = { x: 0, y: 9.8, z: 0.5 };
const upsideDown = { x: 0, y: -9.8, z: 0.5 };

describe("ShakeDetector", () => {
  it("静止していると反応しない", () => {
    const d = new ShakeDetector();
    for (let t = 0; t < 1000; t += 16) {
      expect(d.push({ x: 0.1, y: 9.8, z: 0.2 }, t)).toBe(false);
    }
  });

  it("大きく振ると 1 回として数え、すぐには重ねて数えない", () => {
    const d = new ShakeDetector(18, 160);
    d.push(upright, 0);
    expect(d.push({ x: 15, y: 20, z: 0 }, 16)).toBe(true);
    expect(d.push({ x: -15, y: 0, z: 0 }, 32)).toBe(false);
    expect(d.push({ x: 15, y: 20, z: 0 }, 200)).toBe(true);
  });
});

describe("FlipDetector", () => {
  it("逆さの状態が一定時間続いたら反応する", () => {
    const d = new FlipDetector(250, 1);
    expect(d.push(upright, 0)).toBe(false);
    expect(d.push(upsideDown, 100)).toBe(false);
    expect(d.push(upsideDown, 300)).toBe(false);
    expect(d.push(upsideDown, 360)).toBe(true);
  });

  it("一瞬逆さになっただけでは反応しない", () => {
    const d = new FlipDetector(250, 1);
    d.push(upright, 0);
    d.push(upsideDown, 100);
    d.push(upright, 200);
    expect(d.push(upsideDown, 400)).toBe(false);
  });

  it("符号が逆の端末（最初が負）でも動く", () => {
    const d = new FlipDetector(0, 1);
    d.push(upsideDown, 0);
    expect(d.push(upright, 10)).toBe(true);
  });

  it("机に置いた状態では基準を決めない", () => {
    const d = new FlipDetector(0, 1);
    d.push({ x: 0, y: 0.2, z: 9.8 }, 0);
    expect(d.push({ x: 0, y: -0.2, z: -9.8 }, 10)).toBe(false);
  });
});
