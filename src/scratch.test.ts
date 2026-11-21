import { describe, expect, it } from "vitest";
import { clearedRatio } from "./scratch.ts";

function pixels(alphas: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(alphas.length * 4);
  alphas.forEach((a, i) => {
    data[i * 4 + 3] = a;
  });
  return data;
}

describe("clearedRatio", () => {
  it("透明な画素の割合を返す", () => {
    expect(clearedRatio(pixels([0, 0, 255, 255]), 1)).toBe(0.5);
    expect(clearedRatio(pixels([255, 255, 255, 255]), 1)).toBe(0);
    expect(clearedRatio(pixels([0, 0, 0, 0]), 1)).toBe(1);
  });

  it("空なら 0", () => {
    expect(clearedRatio(new Uint8ClampedArray(0))).toBe(0);
  });
});
