/** くじ 1 種類分の設定です。 */
export interface Prize {
  /** 画面に出す名前 */
  readonly label: string;
  /** 補足（省略可） */
  readonly note?: string;
  /** 出やすさ。数が大きいほど出やすくなります */
  readonly weight: number;
  /** くじの色（#rrggbb） */
  readonly color: string;
  /** true なら紙吹雪でお祝いします */
  readonly celebrate?: boolean;
}

/** 画面上部に出すタイトルです。 */
export const TITLE = "くじ引き";

/**
 * くじの中身です。ここを書き換えて push すると、内容が変わります。
 * 確率は weight の比で決まります（下の例なら 大当たり は 1/40）。
 */
export const PRIZES: readonly Prize[] = [
  { label: "大当たり", note: "特賞", weight: 1, color: "#d4302b", celebrate: true },
  { label: "当たり", note: "1等", weight: 4, color: "#e08a00", celebrate: true },
  { label: "小当たり", note: "2等", weight: 10, color: "#2f7fd8" },
  { label: "はずれ", note: "また挑戦してね", weight: 25, color: "#7d8591" },
];
