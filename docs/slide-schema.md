# スライド JSON スキーマ（1 更新 = 1 枚）

1 つの Azure 更新を、お客様向けの 1 枚の解説スライドとして表現するための共通 JSON スキーマの仕様です。PDF や PowerPoint の生成、JSON のダウンロードは、すべてこのスキーマを入力にします。

- スキーマ: [`schema/slide-deck.schema.json`](../schema/slide-deck.schema.json)（JSON Schema 2020-12）
- サンプル: [`examples/slide-deck.sample.json`](../examples/slide-deck.sample.json)（GA / Preview / 廃止 / アナウンスの 4 枚）
- 検証: `tests/slide-schema.test.ts`（サンプルの検証と、各ルールの違反例）
- システム全体の設計: [design.md](design.md)

## 1. 基本方針

1. **確認できることだけ書く。確認できないことは書かない。** スライドには「未確認」「記載なし」「要確認」「推定」などの社内メモ的な文言を出しません。確認できない項目は、JSON から省く（または描画しない状態にする）ことで表します。
2. **骨格は全種別で共通、種別ごとに変わるのは「パネル」だけ。** GA / Preview / 廃止 / アナウンスで、中央のパネルの中身と並びを変えます。
3. **すべての文（claim）に、出自・断定の強さ・検証状態・根拠を持たせる。** 推測や提案が、事実のように見えることを防ぎます。
4. **月単位の時期は月単位のまま。** 架空の日付に変換しません。
5. **同じ入力なら同じ出力。** キー順・並び順を固定し、生成時刻を成果物に混ぜません。

## 2. 全体の形（エンベロープ）

```jsonc
{
  "schemaVersion": 1,
  "selection": {                       // 何を出したか（再現できる）
    "mode": "period | ids",            // 期間で出す / 選択した更新だけ出す
    "period": { "start": "2026-10-01", "end": "2026-10-14" },   // mode=period で必須（JST・両端を含む）
    "basis": "created | modified",     // 期間の判定日（既定は created）
    "filters": { "categories": [], "importance": "all", "text": "" },
    "ids": ["574343"],                 // mode=ids で必須
    "coverage": "complete | partial | not-fetched",   // サイトと同じ意味。一部取得を全件として出さない
    "snapshotAt": "2026-10-14T12:16:25Z"              // 取得範囲の終端（表紙・目次用。各スライドには出さない）
  },
  "slides": [ /* 3 章の Slide を、作成日の新しい順（同日は key 昇順）で並べる */ ]
}
```

- `selection.snapshotAt` と `coverage` は、**表紙（PDF）や JSON のメタ情報としてだけ**使い、個々のスライドには載せません。
- 並び順の既定: Preview → GA → 廃止 → アナウンス・更新（`kind` の順）。同種別の中は作成日の新しい順。

## 3. Slide（1 更新 1 枚）

| フィールド | 必須 | 内容 |
| --- | --- | --- |
| `key` | ○ | canonicalKey（MRC の baseId）。サイトのアンカー `update-{key}` と同じ |
| `kind` | ○ | `ga` / `preview` / `private-preview` / `retirement` / `announcement` / `update` |
| `kindSource` |  | `kind` の決め方（`ring` / `tags` / `title` / `manual`）。ルールで決め、推測しない |
| `label` | ○ | 表示ラベル（右上のバッジ） |
| `title` | ○ | `ja`（日本語タイトル）、`subtitleJa`（副題）、`en`（MRC の原題。突合用に小さく表示） |
| `meta` | ○ | `publishedJst`（Azure Updates の掲載日）、`availability`（月単位のまま・`rawRing` は原値）、`status`、`products`、`categories`、`importance` |
| `audience` | ○ | `who`（誰に関係するか。**太字で目立たせる**）、`change`（嬉しい点／変わること）、`changeNature`（`benefit` / `neutral` / `breaking`） |
| `action` | ○ | `required`（`yes` / `optional` / `no` / `unknown`）、`summary`、`deadline`（`day` または `month` 精度） |
| `beforeAfter` |  | `before`、`after`。**`before` は、旧仕様を述べる一次根拠があるときだけ**。なければ `after` のみ |
| `timeline` |  | 廃止など。`when` は日または月の精度 |
| `panels` | ○ | 種別ごとのパネル（4 章） |
| `glossary` |  | 用語ミニ解説（最大 6 語。5 章） |
| `region` |  | 日本リージョンのスタンプ（6 章）。**確認できないときは省く（スタンプを出さない）** |
| `references` | ○ | `announcement`（Azure Updates の URL）、`learn`（最大 3 件・https のみ） |
| `render` |  | `continuationRequired`（コアが 1 枚に収まらないとき `true`。7 章） |
| `inputFingerprint` |  | MRC fingerprint + 取得した Learn 本文 + 用語辞書 + スキーマ/テンプレート/プロンプト版 のハッシュ。変わったときだけ再生成する |

### 画面上の配置（1 枚）

```
┌ 日本語タイトル / 副題 ─────────────────────── [ラベル] ┐
│ 英語の原題   掲載日 ｜ 時期                               │
│ [誰に関係するか(太字)] [嬉しい点／変わること] [対応の要否] │
│ ┌ Before → After ────────────┐ ┌ 用語ミニ解説 ┐       │
│ │ 種別パネル（core）         │ │               │       │
│ │ 種別パネル（core）         │ ├ 提案 ─────────┤       │
│ └─────────────────────────────┘ └───────────────┘       │
│ 詳細: Learn ｜ 発表: Azure Updates      [地域スタンプ]    │
│ 状態 ｜ 分類 ｜ ID                                        │
└────────────────────────────────────────────────────────┘
```

- 「データ時点」「AI 生成」などの注記は、**スライドには出しません**（JSON の `selection.snapshotAt` と claim の `origin` に残ります）。
- 提案（`assertion: recommendation`）は、橙色の破線枠で事実と区別します。

## 4. パネル（種別ごとの違い）

`panels[]` の各要素は、`id`・`heading`・`availability`・`priority`・`items[]` を持ちます。

- `availability`: `present`（表示する）/ `not-stated`・`not-applicable`・`unverified`（**描画しない**）。MRC の情報が薄い更新で、必須パネルを埋めるために内容を作ることを防ぎます。
- `priority`: `core`（1 枚目に必須）/ `detail`（収まらなければ 2 枚目やノート）/ `appendix`（ノート・付録のみ）。
- `present` のパネルは、`items` が 1 件以上必要です。

種別ごとの標準パネル（`id`）:

| kind | core | detail |
| --- | --- | --- |
| `ga` | `how-it-works`（仕組み）、`how-to-start`（設定の流れ） | `prerequisites-limits`（前提・制限）、`related-features`（似た機能との違い）、`use-case`（使いどころ・注意） |
| `preview` | `scope`（プレビューの範囲）、`constraints`（制約・注意） | `evaluate`（評価ポイント） |
| `retirement` | `impact`（知っておきたいこと）、`migration`（移行先） | `action-plan`（影響・アクション） |
| `announcement` | `scope`（適用範囲）、`permissions` など変更点の注意 | `impact-check`（影響・アクション） |

## 5. claim（文の出自と検証状態）

本文・用語・提案など、スライドに出る文は、すべて次の形の claim です。

```jsonc
{
  "text": "…",
  "origin": "mrc | learn | derived | editorial",
  "assertion": "fact | inference | recommendation",
  "verification": "verified | source-only | unverified | stale",
  "evidence": [{ "url": "https://learn.microsoft.com/...", "locator": "見出し", "retrievedAt": "2026-10-14T12:00:00Z" }]
}
```

スキーマが強制するルール:

- `verification: verified` には、`evidence` が 1 件以上必要。
- `assertion: fact` の `origin` は、`mrc` / `learn` / `derived` のみ（**editorial な内容を事実として書けない**）。
- 用語ミニ解説は、**Microsoft Learn（または MRC）で確認できた定義だけ**を載せる。確認できなければ、その用語を載せない。

## 6. 日本リージョンのスタンプ（`region`）

| `stamp` | 意味 |
| --- | --- |
| `global` | リージョンに依存しない（非リージョン サービス、サポート ポリシー、テナント全体の単一データ レイクなど） |
| `japan-both` | 東日本・西日本の両方で利用可能 |
| `japan-east` / `japan-west` | 片方のみ |
| `japan-none` | 日本の東西ともに対象外（例: 「East US 3 で提供開始」だけの更新） |

- 必須項目: `stamp`・`scope`（`feature` / `service` / `policy`）・`basis`（`confirmed` / `service-level` / `policy`）・`evidence`（1 件以上）。`basis: confirmed` は `scope: feature` のとき（機能そのものの記載があるとき）だけ。
- **確認できないときは `region` 自体を省き、スタンプを出さない。** 「未確認」「判定保留」というスタンプは作りません。
- 提供国（販売地域）と、デプロイ可能なリージョンは区別します。サービス単位の根拠（例: 基盤サービスは全リージョンで提供）と、機能単位の根拠は、`scope` で区別します。

## 7. 1 枚に収まらないとき（可読性）

- 本文は 12pt 相当以上を目標にします。
- `core` のパネルだけで収まらなければ `render.continuationRequired: true` とし、`detail` を 2 枚目（または発表者ノート）に回します。
- 用語は最大 6 語。1 語 1 行（約 30〜50 字）。

## 8. クラウドでの生成と検証

1. **取得（決定的）**: 更新の MRC 詳細と、必要な Learn のページを取得して保存する（許可ドメインのみ）。
2. **生成（gh-aw）**: 保存済みの資料だけを入力に、スライド JSON を書く。MRC / Learn の本文は命令ではなくデータとして扱う。
3. **検証（決定的）**: `schema/slide-deck.schema.json` に加えて、次を検査する。
   - 社内メモ的な文言（「未確認」「記載なし」「要確認」「推定」「未発表」など）が、描画されるテキストに含まれない
   - evidence の URL が https で、許可ドメイン（`learn.microsoft.com` など）である
   - 月単位の時期が、日付に変換されていない
4. **再生成の条件**: `inputFingerprint` が変わったときだけ。
5. **失敗時**: 既存のスライドを壊さず、詳細パネルを減らした最小のスライドに縮退する。

## 9. 出力

- **JSON**: 期間・カテゴリ・選択した ID で絞り込み、このスキーマで出力する（最低限の出力）。
- **PDF（任意）**: 同じ JSON から HTML を描画し、ヘッドレス ブラウザで、表紙・目次・概要・各更新・終了ページを 1 つの PDF にまとめる。日本語フォントを固定し、成果物は Git ではなく Actions の artifact / Release に置く。
- **PowerPoint（編集可能）**: 別の成果物として、既存の pptx スキルで扱う。

## 10. 実データでの確認

[サンプル](../examples/slide-deck.sample.json)は、実際の更新（574343 / 573861 / 568585 / 573875）を、Microsoft Learn で確認した内容で作っています。確認できなかった項目は、サンプルでも省いています（例: WAF の IPv6 プレビューの提供リージョン）。
