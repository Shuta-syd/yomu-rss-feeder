# アイコン刷新 + favicon 整備

**作成日**: 2026-05-17
**スコープ**: Yomu のアプリアイコン (PWA / favicon / apple-touch) を「Arc Browser的グラデオーブ + Y字ネガティブスペース」に刷新する。あわせて Android maskable アイコンと favicon.ico を新設する。

## 動機

現状アイコンは漢字「読」+ ティールのグラデで、デザインが古典的かつPWA小サイズで潰れる。海外テック (Vercel / Linear / Anthropic / Arc / Cursor) 系のミニマル/抽象方向に揃え、AI時代の RSS リーダーとしてふさわしい現代的なブランド表現に置き換える。

## ビジュアル仕様

### コアアイコン (`icon.svg`)

- viewBox: `0 0 64 64`
- 円形オーブ (中心 32,32 / 半径 28、最外周まで描画)
- グラデーション (radialGradient, 光源左上):
  - `cx=0.32 cy=0.28 r=0.95`
  - stops: `0% #fb7185 → 40% #a855f7 → 85% #1e3a8a → 100% #020617`
- Y字をマスクでネガティブスペース化:
  - 上V部: `M 19,14 L 32,32 L 45,14 L 40,14 L 32,25 L 24,14 Z` (64x64換算)
  - 下stem部: `M 29.5,33 L 34.5,33 L 34.5,50 L 29.5,50 Z`
- 背景タイルなし (透明) — Next.js / ブラウザがコンテナ枠を提供

### Maskable版 (`icon-maskable.svg`)

- viewBox: `0 0 64 64`
- PWA maskable 規格: 最小安全領域は中心から 40% (直径80%) 円内。本実装ではより保守的に半径 20 (= 直径62.5%) 内に主要要素を収める
- オーブ半径を 28 → 20 に縮小、中心は 32,32 のまま
- 背景全面に `#050507` を塗る (PWA maskable purpose は背景透明NG)
- Y字パスもオーブ縮小に合わせて比例縮小 (約 20/28 = 0.71倍)

### 出力サイズ

- SVG (ソース、無限拡大)
- PNG 192x192, 512x512 (manifest)
- PNG 512x512 maskable
- ICO 16+32+48 multi-resolution (legacy favicon)

## 成果物

| ファイル | 種別 | 生成元 | 用途 |
|---|---|---|---|
| `src/app/icon.svg` | 編集 (上書き) | 手書き | Next.js が `<link rel=icon>` に自動採用 |
| `src/app/favicon.ico` | 新規 | スクリプト生成 | レガシーブラウザ用 |
| `src/app/icon-maskable.svg` または `public/icons/icon-maskable.svg` | 新規 | 手書き | maskable PNG の生成元 (※下記決定事項参照) |
| `public/icons/icon.svg` | 編集 (上書き) | `src/app/icon.svg` をコピー | manifest 参照 |
| `public/icons/icon-192.png` | 編集 (上書き) | スクリプト生成 | manifest / apple-touch-icon |
| `public/icons/icon-512.png` | 編集 (上書き) | スクリプト生成 | manifest |
| `public/icons/icon-maskable-512.png` | 新規 | スクリプト生成 | manifest maskable |
| `public/manifest.json` | 編集 | 手書き | theme_color 更新 + maskable エントリ追加 |
| `src/app/layout.tsx` | 編集 | 手書き | `viewport.themeColor` を `#a855f7` に |
| `scripts/generate-icons.ts` | 新規 | 手書き | SVG → PNG/ICO 一括生成 |
| `package.json` | 編集 | 手書き | `sharp`, `png-to-ico` を devDependencies に / `icons:build` script 追加 |

### 決定事項

- **Maskable SVGの置き場所**: `public/icons/icon-maskable.svg` (生成元として残しておくが、manifest からは PNG を参照)
- **Apple touch icon**: 既存の `/icons/icon-192.png` を流用する設定なので、PNG を差し替えるだけで反映される
- **theme_color**: `#a855f7` (オーブのバイオレット中心) を採用。manifest と viewport の両方を更新
- **背景タイル**: SVG には含めない。OS や Next.js icon Route が自動で角丸タイルを与える

## 生成スクリプト (`scripts/generate-icons.ts`)

- 入力: `src/app/icon.svg` (通常版) と `public/icons/icon-maskable.svg` (maskable版)
- 処理:
  1. `sharp` で SVG を 192/512 の PNG にラスタライズ → `public/icons/` に書き出し
  2. 同様に maskable SVG → `public/icons/icon-maskable-512.png`
  3. `sharp` で 16/32/48 PNG を中間生成 → `png-to-ico` npm パッケージで `src/app/favicon.ico` に結合 (16+32+48 multi-resolution)
  4. `public/icons/icon.svg` に `src/app/icon.svg` をコピー
- 実行: `pnpm icons:build` (一回限り、ビルドパイプラインには組み込まない)
- 生成物はすべて git にコミットして配布

## メタデータ更新

### `public/manifest.json`

```diff
 {
   "name": "Yomu RSS Reader",
   "short_name": "Yomu",
   "description": "AI搭載セルフホストRSSリーダー",
   "start_url": "/feeds",
   "display": "standalone",
   "background_color": "#0f0f14",
-  "theme_color": "#2dd4bf",
+  "theme_color": "#a855f7",
   "icons": [
     { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml" },
-    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
-    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
+    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
+    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
+    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
   ]
 }
```

### `src/app/layout.tsx`

```diff
 export const viewport: Viewport = {
-  themeColor: "#2dd4bf",
+  themeColor: "#a855f7",
 };
```

## テスト / 検証

ビジュアル課題のため Vitest 対象外。以下を目視確認する。

1. `pnpm dev` 起動 → ブラウザタブの favicon が新オーブに変わっているか
2. `<head>` 内に Next.js が `/icon.svg` を自動配置しているか (DevTools Elements)
3. `/manifest.json` を直接開いて theme_color と maskable エントリを確認
4. Chrome DevTools → Application → Manifest で:
   - すべてのアイコンが読み込まれること
   - maskable プレビューで Y が安全領域内に収まっていること
5. Lighthouse PWA タブで `Maskable icon` の警告が消えていること
6. iPad/iPhone (実機 or Safari Web Inspector) でホーム画面追加 → apple-touch-icon が新オーブになっていること

## スコープ外

- スプラッシュ画面画像 (apple-touch-startup-image)
- ダーク/ライト切替アイコン (オーブ自体が暗背景前提、両モード共用)
- README / docs 内に貼られているアイコン画像 (現状無し)
- Cloudflare Tunnel 経由のキャッシュ無効化 (再ビルド後の `git push` で自動反映される想定)

## 失敗時のロールバック

すべて `git revert` で完結する。生成物は git 管理、SVG ソースも git 管理なので、コミットを戻すだけで旧アイコンに戻る。

## 完了基準 (DoD)

- [ ] 新 `icon.svg` がコミットされ、ブラウザタブで新オーブが見える
- [ ] `favicon.ico` が新オーブで生成され、レガシーブラウザでも表示される
- [ ] `manifest.json` の theme_color が `#a855f7`、maskable エントリが追加されている
- [ ] `viewport.themeColor` が `#a855f7` に更新されている
- [ ] PNG 192/512、maskable 512 が新オーブで生成されている
- [ ] `pnpm icons:build` が冪等に動く (再実行で差分が出ない)
- [ ] Codex review を回し、指摘を反映、レビューで「問題なし」になるまで反復
- [ ] `make check` (lint + typecheck + test) が緑
