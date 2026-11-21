import QRCode from "qrcode";
import "./style.css";
import "./admin.css";
import {
  buildPlayUrl,
  configFromHash,
  DEFAULT_CONFIG,
  type KujiConfig,
  LIMITS,
  probabilities,
  validateConfig,
} from "./config.ts";
import type { Prize } from "./prizes.ts";
import { TITLE } from "./prizes.ts";

const DRAFT_KEY = "kuji:admin-draft";
const PALETTE = ["#d4302b", "#e08a00", "#2f7fd8", "#22a35a", "#a77bf3", "#ff6f91", "#7d8591"];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} が見つかりません`);
  return el as T;
}

const titleInput = $<HTMLInputElement>("title");
const rowsEl = $("rows");
const totalEl = $("total");
const errorsEl = $("errors");
const resultEl = $("result");
const qrImg = $<HTMLImageElement>("qr");
const urlArea = $<HTMLTextAreaElement>("url");
const openLink = $<HTMLAnchorElement>("open");
const downloadLink = $<HTMLAnchorElement>("download");

let prizes: Prize[] = [];

function saveDraft(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(currentConfig()));
  } catch {
    // 保存できなくても使える
  }
}

function loadDraft(): KujiConfig | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as KujiConfig;
    return Array.isArray(value.prizes) && value.prizes.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function currentConfig(): KujiConfig {
  return { title: titleInput.value.trim() || TITLE, prizes };
}

function setConfig(config: KujiConfig): void {
  titleInput.value = config.title === TITLE ? "" : config.title;
  prizes = config.prizes.map((p) => ({ ...p }));
  renderRows();
}

function update(index: number, patch: Partial<Prize>): void {
  const prev = prizes[index];
  if (prev === undefined) return;
  const next: Prize = { ...prev, ...patch };
  if (next.note === "") delete (next as { note?: string }).note;
  prizes[index] = next;
  renderStats();
  saveDraft();
  resultEl.hidden = true;
}

function renderRows(): void {
  rowsEl.replaceChildren(
    ...prizes.map((p, i) => {
      const row = document.createElement("div");
      row.className = "row";

      const color = document.createElement("input");
      color.type = "color";
      color.value = p.color;
      color.setAttribute("aria-label", `${i + 1} 行目の色`);
      color.addEventListener("input", () => update(i, { color: color.value }));

      const label = document.createElement("input");
      label.type = "text";
      label.value = p.label;
      label.maxLength = LIMITS.labelMax;
      label.placeholder = "名前（例：大当たり）";
      label.className = "label";
      label.setAttribute("aria-label", `${i + 1} 行目の名前`);
      label.addEventListener("input", () => update(i, { label: label.value }));

      const note = document.createElement("input");
      note.type = "text";
      note.value = p.note ?? "";
      note.maxLength = LIMITS.noteMax;
      note.placeholder = "ひとこと（任意）";
      note.className = "note";
      note.setAttribute("aria-label", `${i + 1} 行目のひとこと`);
      note.addEventListener("input", () => update(i, { note: note.value }));

      const weight = document.createElement("input");
      weight.type = "number";
      weight.inputMode = "numeric";
      weight.min = "0";
      weight.max = String(LIMITS.maxWeight);
      weight.value = String(p.weight);
      weight.className = "weight";
      weight.setAttribute("aria-label", `${i + 1} 行目の割合`);
      weight.addEventListener("input", () => update(i, { weight: Number(weight.value) }));

      const rate = document.createElement("span");
      rate.className = "rate";
      rate.dataset["index"] = String(i);

      const party = document.createElement("label");
      party.className = "party";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = p.celebrate === true;
      check.addEventListener("change", () => update(i, { celebrate: check.checked }));
      party.append(check, "🎉");
      party.title = "当たり演出";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${i + 1} 行目を削除`);
      remove.disabled = prizes.length <= 1;
      remove.addEventListener("click", () => {
        prizes.splice(i, 1);
        renderRows();
        saveDraft();
        resultEl.hidden = true;
      });

      row.append(color, label, weight, rate, party, remove, note);
      return row;
    }),
  );
  $<HTMLButtonElement>("add").disabled = prizes.length >= LIMITS.maxPrizes;
  renderStats();
}

function renderStats(): void {
  const rates = probabilities(prizes);
  for (const el of rowsEl.querySelectorAll<HTMLElement>(".rate")) {
    const r = rates[Number(el.dataset["index"])] ?? 0;
    el.textContent = `${(r * 100).toFixed(r < 0.1 && r > 0 ? 1 : 0)}%`;
  }
  const total = prizes.reduce((s, p) => s + (Number.isFinite(p.weight) ? p.weight : 0), 0);
  totalEl.textContent = `合計 ${total}`;
  errorsEl.replaceChildren();
}

$("add").addEventListener("click", () => {
  if (prizes.length >= LIMITS.maxPrizes) return;
  prizes.push({ label: "", weight: 10, color: PALETTE[prizes.length % PALETTE.length] ?? "#7d8591" });
  renderRows();
  saveDraft();
  rowsEl.querySelector<HTMLInputElement>(".row:last-child .label")?.focus();
});

$("reset").addEventListener("click", () => {
  setConfig(DEFAULT_CONFIG);
  saveDraft();
  resultEl.hidden = true;
});

titleInput.addEventListener("input", () => {
  saveDraft();
  resultEl.hidden = true;
});

$("issue").addEventListener("click", async () => {
  const config = currentConfig();
  const errors = validateConfig(config);
  errorsEl.replaceChildren(
    ...errors.map((e) => {
      const li = document.createElement("li");
      li.textContent = e;
      return li;
    }),
  );
  if (errors.length > 0) {
    resultEl.hidden = true;
    return;
  }
  // くじ画面は管理画面と同じ階層の index.html
  const playUrl = buildPlayUrl(new URL("./", window.location.href).toString(), config);
  urlArea.value = playUrl;
  openLink.href = playUrl;
  const qr = await QRCode.toDataURL(playUrl, { width: 480, margin: 2, errorCorrectionLevel: "M" });
  qrImg.src = qr;
  downloadLink.href = qr;
  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("copy").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("copy");
  try {
    await navigator.clipboard.writeText(urlArea.value);
    button.textContent = "コピーしました！";
  } catch {
    urlArea.select();
    button.textContent = "選択しました。コピーしてください";
  }
  window.setTimeout(() => {
    button.textContent = "URL をコピー";
  }, 1800);
});

$("load").addEventListener("click", () => {
  const input = $<HTMLInputElement>("load-url");
  let hash = "";
  try {
    hash = new URL(input.value.trim()).hash;
  } catch {
    hash = "";
  }
  const read = configFromHash(hash);
  if (!read.custom) {
    errorsEl.replaceChildren(
      Object.assign(document.createElement("li"), { textContent: "その URL からは設定を読み込めませんでした。" }),
    );
    return;
  }
  setConfig(read.config);
  saveDraft();
  resultEl.hidden = true;
  input.value = "";
});

// 起動時：URL に設定があればそれ、なければ下書き、なければ標準
{
  const fromUrl = configFromHash(window.location.hash);
  setConfig(fromUrl.custom ? fromUrl.config : (loadDraft() ?? DEFAULT_CONFIG));
}
