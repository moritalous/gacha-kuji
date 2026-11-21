# gacha-kuji

スマホで遊ぶ、くじ引きの Web アプリです。スマホのモーションセンサーを使い、次の 3 ステップでくじを引きます。

| ステップ | 操作 | 使っている仕組み |
| --- | --- | --- |
| 1. 振る | スマホを振ってくじを混ぜる（擬音・効果音・くじが跳ねる演出つき） | `devicemotion`（加速度の急な変化を数える） |
| 2. 出す | スマホを上下逆さにして青・緑・黄のくじを 3 枚出し、元の向きに戻す | `devicemotion`（重力の向きが反転したら判定） |
| 3. 選ぶ | 3 枚から 1 枚をタップして選ぶ | 3 枚はそれぞれ独立に抽選。色の並びは毎回ランダムで、色と中身は関係ない |
| 4. めくる | 画面をこすって結果を見る | `<canvas>` と Pointer Events（スクラッチ） |

センサーが使えない端末（PC など）や、許可しなかった場合は、タップやボタンで同じ操作ができます。振る・出す・めくるの各工程には、スキップ用のボタンもあります。

## くじの中身を変える

### 設定ページで変える（再デプロイ不要）

`https://<user>.github.io/gacha-kuji/admin.html` を開き、タイトル・くじの種類（名前・ひとこと・割合・色・🎉 演出）を入力して「URL と QR コードをつくる」を押します。
発行された URL（または QR コード）を配れば、その中身でくじが引けます。

- 設定は URL の `#c=…` に入っていて、サーバーには保存されません。イベントごとに別の URL を作れます。
- 割合は「出やすさ」で、合計に対する比で確率が決まります。
- URL を読み解けば割合はわかり、書き換えもできます。改ざん防止のチェックはしていないので、厳密な管理には向きません。
- `#c=` がない URL や、読めない URL のときは、下の標準設定で動きます。

### 標準設定を変える

`src/prizes.ts` の `PRIZES` と `TITLE` を編集して `main` に push すると、`#c=` なしで開いたときの中身が変わります。

## 公開（GitHub Pages）

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
2. `main` に push（マージ）すると `.github/workflows/deploy.yml` が動き、テストとビルドのあと `https://<user>.github.io/gacha-kuji/` に公開されます。

`main` 以外のブランチへの push では、ワークフローは動きません。

## 端末ごとの注意

- **HTTPS が必須です。** モーションセンサーは安全なコンテキストでしか使えません。GitHub Pages は HTTPS なので問題ありません。
- **iOS Safari** では、「くじを引く」を押したときにモーションセンサーの許可ダイアログが出ます。許可しない場合はタップで進めます。
- **画面の自動回転**をオフにしておくと、逆さにしたときに画面が回らず見やすくなります（Web からは回転を固定できない端末が多いため）。
- 振動（`navigator.vibrate`）は Android のみで、iOS Safari では振動しません。
- 効果音は Web Audio で鳴らしています。画面右上の「音」ボタンでオン／オフを切り替えられます。iPhone はマナーモード中だと鳴らないことがあるようです。

## OGP（共有時のサムネイル）

`index.html` に OGP のメタタグがあり、画像は `public/ogp.png`（1200×630）です。
リポジトリ名やユーザー名を変えて公開する場合は、`og:url` と `og:image` の URL も書き換えてください（絶対 URL でないとサムネイルを表示しないサービスがあるため）。

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
src/main.ts       画面の進行（振る → 出す → 選ぶ → めくる → 結果）
src/sensors.ts    振る・逆さの検知、センサーの許可
src/scratch.ts    こすってめくるカード
src/draw.ts       重み付き抽選（crypto.getRandomValues）
src/sound.ts      効果音（Web Audio、音声ファイルなし）
src/prizes.ts     くじの中身とタイトル（標準設定）
src/config.ts     URL（#c=…）への設定の書き出し・読み込み
admin.html        設定ページ（src/admin.ts）
public/ogp.png    OGP 画像
```
