# Azure Update Digest

Azure の更新情報（[Microsoft Release Communications](https://www.microsoft.com/releasecommunications) = MRC）を収集・保存・正規化し、日本語要約付きの静的サイトとして公開します。収集・要約・公開はすべて GitHub Actions 上で動き、ローカル実行は不要です。

- 今回の範囲: 収集 / 保存 / 正規化 / 日本語要約 / 一覧・検索・絞り込み・アーカイブ / 定期更新
- 対象外: PowerPoint・PDF 生成、月次ジョブ、M365 Roadmap（MRC が使えない場合は失敗として明示し、別ソースへ置換しません）
- 公開サイト: https://aktsmm.github.io/azure-update-digest/
- 設計・方式の詳細: **[docs/design.md](docs/design.md)**（データ層、取得方式、期間・日付、分類・重要度、要約・関連資料、権限、受け入れ条件、運用上の注意）
- スライド JSON スキーマ（1 更新 = 1 枚）: **[docs/slide-schema.md](docs/slide-schema.md)**（[schema](schema/slide-deck.schema.json) / [サンプル](examples/slide-deck.sample.json)）

## 構成（4 層）

```
data/raw/         MRC MCP の応答・取得時刻・成否を不変保存（1 呼び出し = 1 ファイル）
data/normalized/  raw から決定的に再生成（月別、履歴つき）            ← npm run normalize
data/summaries/   日本語要約（原文と別ファイル、gh-aw が生成）
data/related/     Microsoft Learn の関連資料（gh-aw が検証して生成）
data/state/       チェックポイントと取得範囲（coverage）
data/runs/        run report（totalCount・ユニーク ID 数・詳細補完の成否・状態別件数）
dist/             サイト。data/ から常に再生成可能                    ← npm run build:site
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
- 出典: Microsoft Release Communications。コードは MIT（`LICENSE`）。データの扱いは `NOTICE` を参照。

## 開発

```bash
npm ci
npm run typecheck && npm test
npm run collect -- --mode backfill   # MRC に接続して raw を保存（通常は CI が実行）
npm run build                        # normalize + site
```

将来の資料化（PowerPoint / PDF）向けに、`DigestItem` と `runQuery` の結果（期間・フィルター・対象 ID・要約・URL・取得状態・`snapshotAt`）をそのまま再利用できます。
