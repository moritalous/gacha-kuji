# gacha-kuji

スマホで遊ぶ、くじ引きの Web アプリです。スマホのモーションセンサーを使い、次の 3 ステップでくじを引きます。

| ステップ | 操作 | 使っている仕組み |
| --- | --- | --- |
| 1. 振る | スマホを振ってくじを混ぜる（擬音・効果音・くじが跳ねる演出つき） | `devicemotion`（加速度の急な変化を数える） |
| 2. 出す | スマホを上下逆さにして 1 枚出し、元の向きに戻す | `devicemotion`（重力の向きが反転したら判定） |
| 3. めくる | 画面をこすって結果を見る | `<canvas>` と Pointer Events（スクラッチ） |

センサーが使えない端末（PC など）や、許可しなかった場合は、タップやボタンで同じ操作ができます。

## くじの中身を変える

`src/prizes.ts` の `PRIZES` を編集して push してください。確率は `weight` の比で決まります。

```ts
export const PRIZES = [
  { label: "大当たり", note: "特賞", weight: 1, color: "#d4302b", celebrate: true },
  { label: "はずれ", weight: 25, color: "#7d8591" },
];
```

## 公開（GitHub Pages）

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
2. `main` に push すると `.github/workflows/deploy.yml` が動き、`https://<user>.github.io/gacha-kuji/` に公開されます。

`main` 以外への push では、テストとビルドだけを実行します。

## 端末ごとの注意

- **HTTPS が必須です。** モーションセンサーは安全なコンテキストでしか使えません。GitHub Pages は HTTPS なので問題ありません。
- **iOS Safari** では、「くじを引く」を押したときにモーションセンサーの許可ダイアログが出ます。許可しない場合はタップで進めます。
- **画面の自動回転**をオフにしておくと、逆さにしたときに画面が回らず見やすくなります（Web からは回転を固定できない端末が多いため）。
- 振動（`navigator.vibrate`）は Android のみで、iOS Safari では振動しません。
- 効果音は Web Audio で鳴らしています。画面右上の「音」ボタンでオン／オフを切り替えられます。iPhone はマナーモード中だと鳴らないことがあるようです。

## 開発

Node.js 22 以上が必要です。

```bash
npm install
npm run dev     # 同じ LAN のスマホからも開けるよう --host 付きで起動
npm test        # Vitest
npm run build   # 型チェックと本番ビルド（dist/）
```

スマホの実機でセンサーを試すには HTTPS が必要です。LAN の `http://192.168.x.x` ではセンサーが動かないため、GitHub Pages に公開するか、トンネル（ngrok など）を使ってください。

### 構成

```
index.html        画面の骨組み
src/main.ts       画面の進行（振る → 出す → めくる → 結果）
src/sensors.ts    振る・逆さの検知、センサーの許可
src/scratch.ts    こすってめくるカード
src/draw.ts       重み付き抽選（crypto.getRandomValues）
src/sound.ts      効果音（Web Audio、音声ファイルなし）
src/prizes.ts     くじの中身とタイトル
```
