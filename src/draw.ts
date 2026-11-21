/** 0 以上 max 未満の整数を返す乱数関数です。 */
export type RandomInt = (max: number) => number;

/**
 * crypto.getRandomValues を使った一様な整数乱数です。
 * 剰余による偏りが出ないよう、範囲外の値は捨てて引き直します。
 */
export const cryptoRandomInt: RandomInt = (max) => {
  if (!Number.isInteger(max) || max <= 0 || max > 0x1_0000_0000) {
    throw new RangeError(`max must be an integer in 1..2^32: ${max}`);
  }
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % max);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const value = buf[0] ?? 0;
    if (value < limit) return value % max;
  }
};

/** weight を重みとして 1 つ選び、そのインデックスを返します。 */
export function pickIndex(
  items: readonly { readonly weight: number }[],
  randomInt: RandomInt = cryptoRandomInt,
): number {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) throw new Error("weight の合計が 0 のため抽選できません。");
  let ticket = randomInt(total);
  for (const [index, item] of items.entries()) {
    const w = Math.max(0, item.weight);
    if (ticket < w) return index;
    ticket -= w;
  }
  throw new Error("unreachable");
}
