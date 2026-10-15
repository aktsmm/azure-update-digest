# Azure Update Digest

Azure の更新情報（[Microsoft Release Communications](https://www.microsoft.com/releasecommunications) = MRC）を収集・保存・正規化し、日本語要約付きの静的サイトとして公開します。収集・要約・公開はすべて GitHub Actions 上で動き、ローカル実行は不要です。

- 範囲: 収集 / 保存 / 正規化 / 日本語要約・日本語タイトル / 一覧・検索・絞り込み（期間・カテゴリ・種類）・アーカイブ / 定期更新 / **1 更新 1 枚のスライド JSON・PDF・PowerPoint（.pptx）** / 静的 JSON API / JSON・PDF・PPTX のダウンロード（更新ごとのチェックで必要な分だけ選べます）
- 対象外: 月次ジョブ、M365 Roadmap（MRC が使えない場合は失敗として明示し、別ソースへ置換しません）
- 公開サイト: https://aktsmm.github.io/azure-update-digest/
- 設計・方式の詳細: **[docs/design.md](docs/design.md)**（データ層、取得方式、期間・日付、分類・重要度、要約・関連資料、権限、受け入れ条件、運用上の注意）
- 静的 JSON API: **[docs/api.md](docs/api.md)**
- スライド JSON スキーマ（1 更新 = 1 枚）: **[docs/slide-schema.md](docs/slide-schema.md)**（[schema](schema/slide-deck.schema.json) / [サンプル](examples/slide-deck.sample.json)）

## 構成（4 層）

```
data/raw/         MRC MCP の応答・取得時刻・成否を不変保存（1 呼び出し = 1 ファイル）
data/normalized/  raw から決定的に再生成（月別、履歴つき）            ← npm run normalize
data/summaries/   日本語要約（原文と別ファイル、gh-aw が生成）
data/related/     Microsoft Learn の関連資料（gh-aw が検証して生成）
data/state/       チェックポイントと取得範囲（coverage）
data/runs/        run report（totalCount・ユニーク ID 数・詳細補完の成否・状態別件数）
dist/             サイト・API・PDF。data/ から常に再生成可能         ← npm run build / build:pdfs / protect:pdfs / build:api
```

- 同じ入力なら normalized / site に差分は出ません（キー順・ソート順固定、生成時刻を混ぜない。`writeIfChanged`）。
- サイトの「データ時点」は取得範囲の終端（`coveredThrough`）で、ビルド時刻ではありません。
- 期間・フィルター判定は `src/lib/period.ts` と `src/lib/query.ts` に集約し、サイト・件数・重要更新・検索・将来のレポートで共用します。

## ワークフロー

| ファイル | 役割 | スケジュール |
| --- | --- | --- |
| `collect-daily.yml` | 日次収集（`modified` ベースの sweep）＋詳細補完、公開 | 毎日 21:00 UTC = **06:00 JST** |
| `backfill.yml` | 初期バックフィル（直近 12 ヶ月）。完了後は no-op | 2 時間ごと（毎偶数時 :17 UTC） |
| `summarize.md` (`.lock.yml`) | **GitHub Agentic Workflow**。日本語要約と Learn 関連資料を生成し PR を作成 | 6 時間ごと（:37 UTC） |
| `slide-dispatch.yml` | 直近 3 か月でスライド未作成の更新を新しい順に最大 30 件、`slide.md` に 1 件ずつ起動（作成済みはスキップ） | 毎週月・木 **03:00 JST**（日・水 18:00 UTC） |
| `slide.md` (`.lock.yml`) | **GitHub Agentic Workflow**。1 更新 1 枚のスライド JSON を生成し PR を作成。PDF も成果物として生成 | 手動（`id`）／ dispatch から |
| `auto-merge-slides.yml` | スライド PR を検証（スキーマ・禁止語・PDF 描画）して自動マージ → 公開 | スライド生成完了時 / 3 時間ごと（:23 UTC） |
| `maintain.md` (`.lock.yml`) | **自己修復の Agentic Workflow**（モデルは `auto`）。決定的な健康チェック（`npm run health`）の結果を読み、コード・設定・テスト・ドキュメントの不具合は PR で直し、直せないもの（ワークフロー定義・Secret・設定）は Issue にまとめる。PR は、許可した範囲（`src` / `tests` / `config` / `schema` / `docs` / `scripts` / README、400 行以内、削除なし）で検査に通れば `auto-merge-maintenance.yml` が自動マージ | 隔週: 毎月 2 日・16 日 **03:17 JST**（1 日・15 日 18:17 UTC）／手動 |
| `auto-merge-maintenance.yml` | 保守 PR の自動マージ。PR のコードは読み取り専用のジョブで検査し（型・テスト・検証）、書き込み権限のジョブは検査した SHA を指定してマージするだけ | 保守完了時 / 6 時間ごと（:29 UTC）/ 手動（`dry_run`） |
| `watchdog.yml` | AI なし。40 分を超えて固まったエージェント実行を取り消し、失敗した Pages デプロイを 1 回だけ再実行 | 毎日 05:41 JST（20:41 UTC。実行は遅れることがある） |
| `pages.yml` | validate → build → GitHub Pages 公開（失敗時は既存公開物を維持） | 呼び出し / data 等の push |
| `ci.yml` | typecheck / test / validate / build | PR |

- `permissions` は最小（収集ジョブのみ `contents: write`、公開ジョブのみ `pages` / `id-token: write`）。`concurrency: data-write` でデータ書き込みを直列化。
- 収集が失敗（MRC 不達・整合性エラー）した場合は commit も deploy もしません。

### 要約・関連資料（Agentic Workflow）

`summarize.md` は Copilot エンジンで動き、MCP サーバーは `microsoft-learn`（`microsoft_docs_search` / `microsoft_docs_fetch`）だけを使います。更新の本文は事前に `npm run pending` が作る `.work/pending.json` で渡すため、MRC への接続は不要です。書き込みは safe-output の `create-pull-request` 経由のみで、エージェント自身は読み取り権限です。

- 生成方式: **CI（Agentic Workflow）**。未生成・失敗でも収集と公開は止まらず、サイトは「要約未生成」と表示します。
- 原文 fingerprint が変わった項目だけ再生成します（`sourceFingerprint` 照合）。
- 出力は `npm run validate` が検査します（長さ、日本語、URL 混入、原文の逐語コピー、関連資料の host・ja-jp・最大 3 件など）。
- **必要な設定**: リポジトリ Secret `COPILOT_GITHUB_TOKEN`（Copilot Requests 権限の PAT）と、リポジトリ設定「Actions に PR の作成・承認を許可」。ワークフロー変更後は `gh aw compile` で `.lock.yml` を更新します。要約の PR は `auto-merge-summaries.yml` が自動でマージします（データ以外のファイルを含まず、`npm run validate` を通ったものだけ）。

### スライドと API

- スライド JSON は Git、PDF はデプロイ時に生成（Git には入れない）。公開は**直近 3 か月**。サイトのボタンで、選んだ範囲の JSON と PDF（表紙・目次・概要付き）をブラウザ内で作成します。詳細は [スライドスキーマ](docs/slide-schema.md)。
- **PDF**: スライドごとの PDF はデプロイ時に作り、**最新の 1 件だけ**サンプル（`pdf/sample.pdf`、パスワード不要）として公開します。それ以外はリポジトリ Secret `PDF_PASSWORD` で暗号化（AES-256-GCM / PBKDF2）して置き、サイトの「PDF（N）」ボタンでパスワードを入力するとブラウザ内で復号・結合します（表紙・目次・概要付き）。「PPTX（N）」ボタンは同じ範囲のスライド JSON から、**編集できる PowerPoint**（テキストボックス・図形・実際のリンク）をブラウザ内で作ります（同じパスワード。`pptxgenjs`）。PDF と完全に同じ見た目にはならない場合があります。パスワードは公開されず、Secret が無い場合はサンプル以外の PDF を公開しません。変更は `gh secret set PDF_PASSWORD` のあと `pages.yml` を再実行します。
- 静的 JSON API: [docs/api.md](docs/api.md)（`api/v1/`）。

## 取得の考え方

- 取得開始時刻で上限を固定した `created ge … and created lt …` を JST 月ごとに 50 件ずつ走査し、`totalCount` とユニーク ID 数が一致した月だけ `complete`、不一致は `partial`。走査中に `totalCount` が変わった場合は最大 2 回やり直し。
- 初期バックフィル: 1 run の上限は `config/collect.json`（ページ 60 / 詳細 300 / 1500 秒）。チェックポイントは `data/state/collect-state.json` の月ごとの `nextOffset`・固定 `cutoff`・取得済み ID。**「初期取得完了」= 対象 12 ヶ月がすべて `complete`**。完了前は各月の状態をサイトに表示します。
- 日次: 直前の `coveredThrough` の 24 時間前から `modified` で走査（新規・更新の両方を拾う）。成功時のみ `coveredThrough` を進めます。
- 取得状態は期間（時刻区間）単位で保存し、サイトは 全件 / 一部 / 未取得 を 0 件と区別して表示します。

## 実データで確認した MRC の挙動

- 一覧は `id` 昇順で安定。`created` の小数秒は 6〜7 桁（`parseInstant` で ms に丸めて比較）。
- 確認した範囲では `id === baseId`。**canonicalKey は `baseId`**。`id` が異なる場合は `ids[]` に保持し、最新の `modified` を採用。
- `modified` が `created` と異なる実例あり（2025-11 の 220 件中 1 件）。履歴（`history[]`）は取得時刻・fingerprint・`modifiedBefore/After`・`changedFields`・`rawRef` を持つ。
- `status` は GA/Preview 系にのみ存在（廃止・Announcement は無し → `null`）。tags は `Feature` / `Features` など表記が揺れるため原値のまま保存。
- `availabilities[].ring`: `Retirement` / `General Availability` / `Preview` / `Private Preview` / `Effective`。`Effective` は意味を証明できないため原値表示のみ（重要度ルールにも使いません）。
- 原文 URL `https://azure.microsoft.com/updates?id={id}` は SPA で、存在しない ID でも HTTP 200 を返すため**存在確認はできません**。サイトでは公式 permalink 形式として表示し、存在を断定しない注記をフッターに載せています。

## 分類・重要度

`config/categories.json`（表示カテゴリ、複数所属可）と `config/importance.json`（入力フィールド・キーワード・点数・しきい値・同点順）で定義。根拠のない項目は通常扱い。GA / Preview / 廃止は `availabilities` と `tags` を根拠とし、時期は月単位のまま保持します。

## 公開範囲・出典・ライセンス

- サイトに載せるもの: タイトル、メタデータ、原文リンク、独自の日本語要約、Learn 関連資料。**MRC の description 全文は表示しません**。
- 注意: `data/raw/` には MRC の応答（description の抜粋・全文を含む）をそのまま保存しており、公開リポジトリで閲覧できます。公開を避けたい場合は raw を別の非公開ストアへ移す運用に変更してください。
- 出典: Microsoft Release Communications。**ライセンスは CC BY-NC-SA 4.0**（`LICENSE`）。商用利用は不可で、利用時は出典と作者（yamapan / aktsmm）の表示、変更の明示、同一ライセンスでの継承が必要です。**Microsoft Corporation とその関連会社には、社内利用・商用利用の追加許諾があります**（第三者には及びません）。Microsoft の原文・Microsoft Learn の内容は対象外です（`NOTICE`）。

## 開発

```bash
npm ci
npm run typecheck && npm test
npm run collect -- --mode backfill   # MRC に接続して raw を保存（通常は CI が実行）
npm run build                        # normalize + site
npm run pending -- --limit 5         # 要約・日本語タイトルが未生成の更新
npm run pending-slides -- --limit 5   # スライド未作成の更新（直近 3 か月）
npm run slide-input -- --id <id>      # スライド生成の入力（.work/）
npm run validate:slides               # data/slides/*.json の検証
npm run pdf -- --dir data/slides --ids <id> --out dist-pdf   # ローカルで PDF を描画
npm run build:pdfs && PDF_PASSWORD=*** npm run protect:pdfs && npm run build:api   # デプロイ時と同じ手順（要 Chrome）
```

資料化（PDF）や API には、`DigestItem` と `runQuery` の結果（期間・フィルター・対象 ID・要約・URL・取得状態・`snapshotAt`）をそのまま再利用しています。
