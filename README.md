# Social Risk Simulator

〜フェイクニュース拡散を自律シミュレーションし、企業の防御力を継続的テストするエージェント〜
Social Risk Simulatorは、SNS上でのデマや情報の拡散をシミュレーションし、組織の広報・危機管理能力をテストするための脆弱性評価プラットフォームです。

## プロジェクト概要
『Social Risk Simulator』は、インフラの世界における「カオスエンジニアリング」の手法を社会のコミュニケーション・インフラに適用したプラットフォームです。Google Cloud 上に構築された架空の SNS 空間で、Gemini を搭載したマルチエージェントが自律的にデマの拡散、信奉、あるいは反論をシミュレーションします。

## 主な機能
- **自律型マルチエージェント**: Gemini 2.5 Flash による高度な意思決定。
- **リアルタイム・シミュレーション**: Firestore と並列処理による高速な拡散追跡。
- **シナリオ駆動型テスト**: 特定のデマに対する組織の脆弱性を数値化。
- **シナリオベース・シミュレーション**: 製品の安全性に関するデマや市場操作、災害時のパニックなど、様々な脅威シナリオをテスト可能。
- **動的介入 (Intervention)**: シミュレーションの途中で「公式声明」などのパッチを注入し、拡散が抑制されるプロセスを観測。
- **AIインサイト**: 拡散状況の要約と、戦略的な推奨アクションをAIが自動生成。
- **モダンな評価ダッシュボード**:
  - 操作性を重視した左右分割レイアウト（左：設定、右：結果）。
  - 洗練されたライトモードUIによる、清潔感のあるデータ表示。
  - 拡散の経緯を詳細に追跡できるプロパゲーション・タイムライン。

## 開発の意図：Social Chaos Engineering
従来のフェイクニュース研究は、学術的な分析や事後のファクトチェックに留まっていました。
このプロダクトは、**「社会のコミュニケーション・インフラ」を一つのシステムと見なし、わざとデマ（障害）を注入することで、組織の広報体制や社会の耐性をテストする**という「カオスエンジニアリング」の思想で実装されています。
Gemini のマルチエージェントを活用することで、単なる統計モデルでは不可能な「人間の感情的な連鎖」や「属性による反応の差異」を自律的に再現し、実効性のある防御策（パッチ）の検証を可能にします。

## 技術スタック
## シミュレーションシナリオと予想される結果
- **Frontend**: React, Tailwind CSS, Lucide React
- **Backend**: Python (FastAPI) ※想定
- **Analysis**: Gemini API (シミュレーションデータの分析・アドバイス)

| シナリオ名 (Key) | 内容 | 予想されるシミュレーション結果 |
| :--- | :--- | :--- |
| **製品混入デマ**<br>`product_safety` | 自社製品への有害物質混入を訴える偽画像/ニュース。 | 「情報感度が高いが信じやすい」エージェントが恐怖から急速に拡散。冷静な専門家が反論を試みるが、感情的な投稿に埋もれるプロセスの可視化。 |
| **株価操作デマ**<br>`market_manipulation` | CEOの不祥事や電撃解任を装った経済ニュース。 | 影響力（influence）の高いビジネス系エージェントが反応した瞬間、マーケット全体にパニックが波及し、信頼スコアが垂直落下する。 |
| **災害パニックデマ**<br>`disaster_panic` | 災害に伴う特定物資（トイレットペーパー等）の枯渇デマ。 | 地理的属性や関心が近いエージェント間で局所的な「バースト」が発生。自治体公式エージェントによる介入の有効性を検証可能。 |
## セットアップ

## 実行コマンド詳細
1.  **バックエンドの起動**:
    ```bash
    # サーバーディレクトリで実行
    uvicorn main:app --reload
    ```

### 特定のシナリオを実行する
定義済みのシナリオキーを使用して、特定の脅威に対するストレステストを行います。
介入（パッチ）を投入したい場合は `intervention_content` と `intervention_round` を追加します。
```bash
curl -X POST "http://localhost:8000/simulate" \
     -H "Content-Type: application/json" \
     -d '{
       "scenario_key": "product_safety",
       "rounds": 3,
       "intervention_content": "速報：〇〇社の成分検査の結果、有害物質は検出されませんでした。デマにご注意ください。",
       "intervention_round": 2 
     }'
```
2.  **フロントエンドの起動**:
    ```bash
    npm install
    npm start
    ```

### 任意のカスタムニュースでテストする
自由なテキストを入力して、即時的な反応をシミュレートします。
```bash
curl -X POST "http://localhost:8000/simulate" \
     -H "Content-Type: application/json" \
     -d '{"news_content": "速報：〇〇社の基幹システムに大規模な脆弱性が発見されました。"}'
```
## 画面の使い方

セットアップ不要で試したい場合は、公開デモを利用できます。

**公開URL**: https://social-risk-simulator-399385533323.us-central1.run.app

### 1. シミュレーションを設定する（左側パネル）

| 項目 | 説明 |
| :--- | :--- |
| **Scenario Preset** | `product_safety`（製品混入デマ）/ `market_manipulation`（株価操作デマ）/ `disaster_panic`（災害パニックデマ）から既定シナリオを選択します。 |
| **Custom News Content** | 任意のテキストを入力すると、そちらが優先してシミュレーション対象になります（Scenario Presetは無視されます）。右上の **Fetch Trends** ボタンで外部トレンド（モック）の候補を取得し、クリックして流し込むこともできます。 |
| **Rounds** | シミュレーションを何ラウンド継続するか（1〜10）。ラウンドを重ねるごとにエージェントは過去の自分の発言や、フォローしている他エージェントの反応を踏まえて次の行動を決定します。 |
| **Intervention Patch** | 「公式声明」（Official Statement）を入力すると、指定した **Injection Round** 以降、全エージェントの意思決定コンテキストにその声明が注入されます。デマ拡散に対する対策の効果を検証できます。空欄のままなら介入なしで実行されます。 |
| **Launch Simulation** | 上記設定でシミュレーションを開始します。実行中はボタンが「Processing...」表示になり、ヘッダーに **LIVE TRACKING** インジケーターが表示されます（Pub/Sub経由の非同期処理結果を3秒間隔でポーリングしています）。 |

### 2. 結果を確認する（右側パネル）

ラウンドの処理が進むにつれて、以下が順次更新されます。

- **Vulnerability Score / Risk Level**: リツイート・返信数とエージェントの影響力から算出した脆弱性スコア（%）と、それに基づくリスク判定（LOW/MEDIUM/CRITICAL）。
- **Suppression Effect**: Intervention Patchを設定した場合、介入前後で1ラウンドあたりの拡散速度が何%変化したかを表示します（プラスは抑制成功、マイナスは悪化）。
- **Top Spreader**: 最もリツイートに貢献したエージェントとその回数。
- **Spread Analytics**: ラウンドごとの新規拡散数（棒グラフ）と累積拡散数（面グラフ）。介入ラウンドには緑の点線が表示されます。
- **Sentiment Distribution**: 全エージェントの反応をPositive/Negative/Neutral/Uncertainに分類したドーナツチャート。
- **Analysis / Recommendations**: シミュレーション完了後、Geminiが状況要約と推奨対応策を自動生成して表示します。
- **Propagation Timeline**: ラウンドごとに、各エージェントの行動（RETWEET/REPLY/IGNORE）、発言内容、そして意思決定の**Logic**（内心の理由づけ）を時系列で確認できます。

### 3. エージェントを管理する

ヘッダー右上の **Manage Agents** ボタンからモーダルを開くと、現在登録されているエージェント（ペルソナ）の一覧確認・削除ができます。**Create New Persona** フォームでは、名前・Gullibility（信じやすさ 0.0〜1.0）・Influence（影響力 0.0〜1.0）・Interests（関心事、カンマ区切り）を指定して新しいエージェントを追加できます。

### 4. 結果をエクスポートする

シミュレーション完了後、ヘッダーに表示される **Export Data** ボタンから、サマリー・AI分析・タイムライン全体をJSONファイルとしてダウンロードできます。

### 脆弱性レポートの確認
シミュレーション結果は Firestore の `simulations` コレクションに保存されます。`session_id` ごとにエージェントの感情変化や拡散アクションを追跡し、組織の「デマ耐性（SVS）」を分析します。

## セットアップ

### 1. 環境構築 (pyenv)
```bash
pyenv local 3.11.11
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. エージェントの初期データ投入
```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
python seed_agents.py
```

### 3. サーバー起動
```bash
uvicorn main:app --reload
```
---
*Professional Vulnerability Assessment for Social Media*