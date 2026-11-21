import { describe, expect, it } from "vitest";
import {
  buildPlayUrl,
  configFromHash,
  DEFAULT_CONFIG,
  decodeConfig,
  encodeConfig,
  type KujiConfig,
  probabilities,
} from "./config.ts";

const sample: KujiConfig = {
  title: "忘年会くじ 🎉",
  prizes: [
    { label: "特賞", note: "温泉旅行", weight: 1, color: "#d4302b", celebrate: true },
    { label: "参加賞", weight: 9, color: "#7d8591" },
  ],
};

describe("config", () => {
  it("日本語や絵文字を含む設定を往復できる", () => {
    expect(decodeConfig(encodeConfig(sample))).toEqual(sample);
  });

  it("URL のフラグメントから読める", () => {
    const url = new URL(buildPlayUrl("https://example.github.io/gacha-kuji/?x=1", sample));
    expect(url.search).toBe("");
    const read = configFromHash(url.hash);
    expect(read.custom).toBe(true);
    expect(read.config).toEqual(sample);
  });

  it("フラグメントがなければ標準の設定", () => {
    expect(configFromHash("")).toEqual({ config: DEFAULT_CONFIG, custom: false, broken: false });
  });

  it("壊れた値やおかしな値は標準の設定に戻す", () => {
    expect(configFromHash("#c=%%%").broken).toBe(true);
    const zero = encodeConfig({ title: "x", prizes: [{ label: "a", weight: 0, color: "#000000" }] });
    expect(configFromHash(`#c=${zero}`).broken).toBe(true);
    const badColor = encodeConfig({ title: "x", prizes: [{ label: "a", weight: 1, color: "red" }] });
    expect(configFromHash(`#c=${badColor}`).config).toBe(DEFAULT_CONFIG);
  });

  it("確率は割合の比になる", () => {
    expect(probabilities(sample.prizes)).toEqual([0.1, 0.9]);
  });
});
