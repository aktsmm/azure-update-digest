# JSON API（静的）

GitHub Pages から配信する、読み取り専用の静的 JSON です。認証は不要で、CORS は `*` で利用できます（ブラウザ、Power Automate、スクリプトから `GET` できます）。

ベース URL: `https://aktsmm.github.io/azure-update-digest/`

## エンドポイント（`api/v1/`）

| パス | 内容 |
| --- | --- |
| `api/v1/index.json` | バージョン、取得時点（`snapshotAt`）、件数、月の一覧と取得状態、エンドポイント一覧、注意書き |
| `api/v1/latest.json` | 直近 30 日（取得時点の JST 日付まで）の更新 |
| `api/v1/months/YYYY-MM.json` | 月別の更新一覧（作成日の JST 月） |
| `api/v1/updates/{id}.json` | 1 件の詳細。スライド JSON があれば `slide` に含む |
| `api/v1/categories/{category}.json` | カテゴリ別の軽量索引（複数所属あり） |
| `slides/{id}.json` | スライド JSON（[スキーマ](slide-schema.md)）。直近 3 か月の作成済みのみ |
| `pdf/{id}.pdf` | 1 更新 1 ページの PDF（直近 3 か月の作成済みのみ。パスワード不要） |
| `data/slides.json` | PDF を公開している更新の一覧と、まとめ PDF 用のパスワード検証値（`pdfGate`） |

任意の条件での絞り込みや全文検索の API はありません（静的ファイルのため）。月別ファイルを取得して、クライアント側で絞り込んでください。

## 更新（item）のフィールド

`key` / `id`、`title`、`createdJst` / `modifiedJst`（JST の暦日）、`status`（無ければ `null`）、`tags` / `products` / `productCategories`（MRC の元値）、`categories`（表示カテゴリ、複数可）、`importance`（`level` / `score` / `topics`）、`availabilities`（ring・年・月。月単位のまま）、`availabilityDates`、`sourceUrl`、`summary`（`state`: generated / stale / missing と `text`）、`related`（Microsoft Learn の確認済み資料）、`fingerprint`、`urls`（`self` / `source` / 存在する場合 `slide` / `slidePdf`）。

## 注意

- **取得状態**: `months[].coverage` が `complete` 以外の月は、更新が欠けている可能性があります。件数が少なくても 0 件とは限りません。
- **原文は再配布しません**: MRC の `description`（原文の説明文）は含めません。要約とスライドは、MRC のメタ情報と Microsoft Learn を根拠に日本語で書いたもので、スライドの各文には根拠 URL（`evidence`）が付いています。
- **安定性**: `schema` と `apiVersion` を持ちます。互換性のない変更は `api/v2/` に分けます。
- **ライセンス**: CC BY-NC-SA 4.0（商用利用不可・要出典・継承）。`index.json` の `license` にも記載。Microsoft の原文・Learn の内容は対象外です。
- **出典**: Microsoft Azure Updates / Microsoft Learn。利用時は出典を明記してください（`index.json` の `attribution`）。
- **更新頻度**: データは毎日、スライドは週 2 回（月・木 03:00 JST）に増えます。
