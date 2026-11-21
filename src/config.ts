import { PRIZES, type Prize, TITLE } from "./prizes.ts";

/** くじ全体の設定です。 */
export interface KujiConfig {
  readonly title: string;
  readonly prizes: readonly Prize[];
}

export const DEFAULT_CONFIG: KujiConfig = { title: TITLE, prizes: PRIZES };

export const LIMITS = {
  titleMax: 30,
  labelMax: 16,
  noteMax: 24,
  maxPrizes: 10,
  maxWeight: 9999,
} as const;

/** URL に載せる形。キー名は URL を短くするため 1 文字にしている */
interface Wire {
  t?: string;
  p: { l: string; n?: string; w: number; c: string; x?: 1 }[];
}

const COLOR = /^#[0-9a-f]{6}$/i;

// ---- Base64URL（UTF-8） ----
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 設定を URL のフラグメント用の文字列にします。 */
export function encodeConfig(config: KujiConfig): string {
  const wire: Wire = {
    p: config.prizes.map((p) => ({
      l: p.label,
      ...(p.note ? { n: p.note } : {}),
      w: p.weight,
      c: p.color,
      ...(p.celebrate ? { x: 1 as const } : {}),
    })),
  };
  if (config.title && config.title !== TITLE) wire.t = config.title;
  return toBase64Url(JSON.stringify(wire));
}

/** 入力内容のおかしな点を返します。問題がなければ空配列です。 */
export function validateConfig(config: KujiConfig): string[] {
  const errors: string[] = [];
  if (config.title.length > LIMITS.titleMax) {
    errors.push(`タイトルは ${LIMITS.titleMax} 文字以内にしてください。`);
  }
  if (config.prizes.length === 0 || config.prizes.length > LIMITS.maxPrizes) {
    errors.push(`くじの種類は 1〜${LIMITS.maxPrizes} 個にしてください。`);
  }
  config.prizes.forEach((p, i) => {
    const row = `${i + 1} 行目`;
    if (p.label.trim() === "" || p.label.length > LIMITS.labelMax) {
      errors.push(`${row}：名前は 1〜${LIMITS.labelMax} 文字にしてください。`);
    }
    if ((p.note ?? "").length > LIMITS.noteMax) {
      errors.push(`${row}：ひとことは ${LIMITS.noteMax} 文字以内にしてください。`);
    }
    if (!Number.isInteger(p.weight) || p.weight < 0 || p.weight > LIMITS.maxWeight) {
      errors.push(`${row}：割合は 0〜${LIMITS.maxWeight} の整数にしてください。`);
    }
    if (!COLOR.test(p.color)) errors.push(`${row}：色の形式が正しくありません。`);
  });
  if (config.prizes.length > 0 && config.prizes.every((p) => p.weight <= 0)) {
    errors.push("割合の合計が 0 です。1 つ以上を 1 以上にしてください。");
  }
  return errors;
}

/** フラグメント用の文字列から設定を復元します。壊れている・おかしい値なら null です。 */
export function decodeConfig(value: string): KujiConfig | null {
  const json = fromBase64Url(value);
  if (json === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as Wire).p)) return null;
  const wire = raw as Wire;
  const prizes: Prize[] = [];
  for (const item of wire.p) {
    if (typeof item !== "object" || item === null) return null;
    const { l, n, w, c, x } = item as Record<string, unknown>;
    if (typeof l !== "string" || typeof w !== "number" || typeof c !== "string") return null;
    prizes.push({
      label: l,
      ...(typeof n === "string" && n !== "" ? { note: n } : {}),
      weight: w,
      color: c,
      ...(x === 1 ? { celebrate: true } : {}),
    });
  }
  const config: KujiConfig = {
    title: typeof wire.t === "string" && wire.t.trim() !== "" ? wire.t : TITLE,
    prizes,
  };
  return validateConfig(config).length === 0 ? config : null;
}

/** URL のフラグメント（#c=…）から設定を読みます。なければ・壊れていれば標準の設定です。 */
export function configFromHash(hash: string): { config: KujiConfig; custom: boolean; broken: boolean } {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("c");
  if (!value) return { config: DEFAULT_CONFIG, custom: false, broken: false };
  const config = decodeConfig(value);
  return config
    ? { config, custom: true, broken: false }
    : { config: DEFAULT_CONFIG, custom: false, broken: true };
}

/** くじ画面の URL を組み立てます。`pageUrl` はくじ画面（index.html）の URL です。 */
export function buildPlayUrl(pageUrl: string, config: KujiConfig): string {
  const url = new URL(pageUrl);
  url.search = "";
  url.hash = `c=${encodeConfig(config)}`;
  return url.toString();
}

/** 各くじの確率（0〜1）を返します。 */
export function probabilities(prizes: readonly Prize[]): number[] {
  const total = prizes.reduce((s, p) => s + Math.max(0, p.weight), 0);
  return prizes.map((p) => (total > 0 ? Math.max(0, p.weight) / total : 0));
}
