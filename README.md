# Social Chaos Monkey

〜フェイクニュース拡散を自律シミュレーションし、企業の防御力を継続的テストするエージェント〜

## プロジェクト概要
『Social Chaos Monkey』は、インフラの世界における「カオスエンジニアリング」の手法を社会のコミュニケーション・インフラに適用したプラットフォームです。Google Cloud 上に構築された架空の SNS 空間で、Gemini を搭載したマルチエージェントが自律的にデマの拡散、信奉、あるいは反論をシミュレーションします。

## 主な機能
- **自律型マルチエージェント**: Gemini 1.5/2.5 Flash による高度な意思決定。
- **リアルタイム・シミュレーション**: Firestore と並列処理による高速な拡散追跡。
- **シナリオ駆動型テスト**: 特定のデマに対する組織の脆弱性を数値化。

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
export GOOGLE_CLOUD_PROJECT="ml-agent-otsuka-202605"
python seed_agents.py
```

### 3. サーバー起動
```bash
uvicorn main:app --reload
```