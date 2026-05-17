SCENARIOS = {
    "product_safety": {
        "title": "製品混入デマ・ストレステスト",
        "content": "警告：〇〇社の新製品にマイクロプラスチックが基準値を超えて混入しているとの内部告発がありました。拡散してください！",
        "expected_risk": "主婦・健康志向層への急速な浸透"
    },
    "market_manipulation": {
        "title": "株価操作シミュレーション",
        "content": "急報：テック業界の巨頭A社のCEOが、不祥事により本日午後に電撃解任される模様。市場はパニックに備えよ。",
        "expected_risk": "ビジネス系インフルエンサーを起点とした信用崩壊"
    },
    "disaster_panic": {
        "title": "災害時物資不足デマ",
        "content": "近隣の製紙工場が火災。明日から都内のトイレットペーパーが完全に姿を消します。今すぐ備蓄を！",
        "expected_risk": "地域コミュニティでのパニック買いの誘発"
    }
}

def get_scenario(key: str) -> str:
    scenario = SCENARIOS.get(key)
    if not scenario:
        return "指定されたシナリオが見つかりません。"
    return scenario["content"]