import { describe, expect, it } from "vitest";
import { cryptoRandomInt, pickIndex } from "./draw.ts";

describe("pickIndex", () => {
  const items = [{ weight: 1 }, { weight: 0 }, { weight: 3 }];

  it("乱数の値に応じて重み通りに選ぶ", () => {
    expect(pickIndex(items, () => 0)).toBe(0);
    expect(pickIndex(items, () => 1)).toBe(2);
    expect(pickIndex(items, () => 3)).toBe(2);
  });

  it("重み 0 のくじは出ない", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) seen.add(pickIndex(items, () => i));
    expect(seen.has(1)).toBe(false);
  });

  it("重みの合計が 0 なら例外", () => {
    expect(() => pickIndex([{ weight: 0 }])).toThrow();
  });
});

describe("cryptoRandomInt", () => {
  it("範囲内の整数を返す", () => {
    for (let i = 0; i < 200; i++) {
      const v = cryptoRandomInt(7);
      expect(Number.isInteger(v) && v >= 0 && v < 7).toBe(true);
    }
  });
});
