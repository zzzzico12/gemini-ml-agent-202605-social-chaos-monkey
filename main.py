import os
import json
import base64
import asyncio
from datetime import datetime, timezone
import uuid
from typing import List, Dict
from google.cloud import pubsub_v1
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google.cloud import firestore
from models import Agent, AgentPersona, SimulationRequest, SimulationResult, SimulationResponse
from scenarios import SCENARIOS, get_scenario
from agent_executor import SocialAgentExecutor
from agent_worker import process_agent_message

app = FastAPI(title="Social Chaos Monkey MVP")

# CORS設定: 開発環境のReact(3000ポートなど)からのアクセスを許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 本来はGoogle Cloudコンソールや環境変数から取得
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "your-project-id")
executor = SocialAgentExecutor(project_id=PROJECT_ID)
db = firestore.Client(project=PROJECT_ID)
publisher = pubsub_v1.PublisherClient()

@app.post("/simulate", response_model=SimulationResponse)
async def start_simulation(request: SimulationRequest):
    """
    指定されたニュースまたはシナリオに基づき、複数ラウンドの自律拡散シミュレーションを実行します。
    """
    session_id = str(uuid.uuid4())
    news_content_to_simulate = ""
    topic_name = f"projects/{PROJECT_ID}/topics/social-chaos-monkey-simulation"

    if request.scenario_key:
        news_content_to_simulate = get_scenario(request.scenario_key)
        if news_content_to_simulate == "指定されたシナリオが見つかりません。": # Check for scenario not found
            raise HTTPException(status_code=404, detail=f"Scenario '{request.scenario_key}' not found.")
    elif request.news_content:
        news_content_to_simulate = request.news_content
    else:
        raise HTTPException(status_code=400, detail="Either 'news_content' or 'scenario_key' must be provided.")

    # Firestoreから全エージェントを取得
    agents_ref = db.collection("agents")
    docs = agents_ref.stream()
    agents = [Agent(**doc.to_dict()) for doc in docs]

    if not agents:
        raise HTTPException(status_code=404, detail="No agents found in Firestore. Run seed_agents.py first.")

    # ラウンド1のみをトリガーする（以降はワーカーが連鎖させる）
    total_agents = len(agents)
    for agent in agents:
        message_data = {
            "session_id": session_id,
            "round": 1,
            "total_rounds": request.rounds,
            "total_agents": total_agents,
            "news_content": news_content_to_simulate,
            "agent_id": agent.agent_id,
            "intervention_content": request.intervention_content,
            "intervention_round": request.intervention_round
        }
        publisher.publish(topic_name, json.dumps(message_data).encode("utf-8"))

    # セッションの初期状態を保存
    db.collection("sessions").document(session_id).set({
        "session_id": session_id,
        "total_rounds": request.rounds,
        "total_agents": total_agents,
        "status": "running",
        "intervention_round": request.intervention_round,
        "news_content": news_content_to_simulate
    })

    return SimulationResponse(
        session_id=session_id,
        results_url=f"/simulation/{session_id}/summary", # サマリーをデフォルトの遷移先に推奨
        results=[] # 非同期処理のため、ここでは結果は返さない
    )

@app.post("/pubsub/push")
async def pubsub_push_handler(request: Request):
    """
    Pub/Sub push配信を受け取り、ラウンド処理を行う。
    Cloud Run上ではpubsub_worker.py(pullベース)の代わりにこちらが使われる。
    """
    envelope = await request.json()
    if not envelope or "message" not in envelope:
        raise HTTPException(status_code=400, detail="Invalid Pub/Sub message format")

    message_data = json.loads(base64.b64decode(envelope["message"]["data"]).decode("utf-8"))
    await process_agent_message(message_data)
    return {"status": "ok"}

@app.get("/simulation/{session_id}")
async def get_simulation_results(session_id: str):
    """
    特定のセッションIDに紐づくシミュレーション結果を時系列で取得します。
    """
    # 複合インデックスエラーを回避するため、Firestoreでのソートを外し、メモリ上でソートを行います。
    docs = db.collection("simulations").where("session_id", "==", session_id).stream()
    results = [doc.to_dict() for doc in docs]
    if not results:
        raise HTTPException(status_code=404, detail="Simulation session not found.")

    # ISO 8601形式の文字列なので、標準のsortで時系列順になります。
    results.sort(key=lambda x: x.get("timestamp", ""))
    return results

@app.get("/simulation/{session_id}/summary")
async def get_simulation_summary(session_id: str):
    """
    シミュレーション結果の統計サマリーを取得します。
    """
    docs = db.collection("simulations").where("session_id", "==", session_id).stream()
    results = [doc.to_dict() for doc in docs]
    if not results:
        raise HTTPException(status_code=404, detail="Simulation session not found.")

    # セッションメタデータを取得
    session_doc = db.collection("sessions").document(session_id).get()
    session_meta = session_doc.to_dict() if session_doc.exists else {}

    summary = {
        "session_id": session_id,
        "total_actions": len(results),
        "by_round": {},
        "action_counts": {"RETWEET": 0, "REPLY": 0, "IGNORE": 0},
        "vulnerability_score": 0.0,
        "risk_level": "LOW",
        "top_spreaders": [],
        "status": session_meta.get("status", "unknown"),
        "total_expected": session_meta.get("total_agents", 0) * session_meta.get("total_rounds", 0),
        "intervention_impact": {
            "pre_spread_count": 0,
            "post_spread_count": 0,
        },
        "sentiment_analysis": {}
    }

    retweet_weight = 2.0
    reply_weight = 1.0
    total_weighted_score = 0.0
    spreader_counts = {}
    intervention_round = session_meta.get("intervention_round")

    for r in results:
        current_round = r.get("round", 1)
        round_num = str(current_round)
        if round_num not in summary["by_round"]:
            summary["by_round"][round_num] = {"RETWEET": 0, "REPLY": 0, "IGNORE": 0}
        
        action = r.get("action")
        emotion = r.get("emotion", "Neutral")
        
        # 感情をカテゴリにマッピング（キーワードが含まれているかで判定）
        emotion_lower = emotion.lower() if emotion else "neutral"
        
        category_keywords = {
            "Positive": ["happy", "relieved", "confident", "optimistic", "calm", "safe", "agree"],
            "Negative": ["anxious", "angry", "worried", "scared", "frustrated", "negative", "concerned", "disappointed", "panic"],
            "Uncertain": ["surprised", "confused", "curious", "skeptical", "shocked", "doubtful"]
        }
        
        sentiment_key = "Neutral"
        found = False
        for cat, keywords in category_keywords.items():
            if any(k in emotion_lower for k in keywords):
                sentiment_key = cat
                found = True
                break
        
        if not found and "neutral" not in emotion_lower:
            # キーワードが見つからないが、明らかに感情が動いている場合はUncertainへ
            if len(emotion_lower) > 5:
                sentiment_key = "Uncertain"
            else:
                sentiment_key = "Neutral"

        summary["sentiment_analysis"][sentiment_key] = summary["sentiment_analysis"].get(sentiment_key, 0) + 1

        if action in summary["action_counts"]:
            summary["action_counts"][action] += 1
            summary["by_round"][round_num][action] += 1
            
            if action == "RETWEET":
                total_weighted_score += retweet_weight
                aid = r.get("agent_id")
                spreader_counts[aid] = spreader_counts.get(aid, {"name": r.get("agent_name"), "count": 0})
                spreader_counts[aid]["count"] += 1
            elif action == "REPLY":
                total_weighted_score += reply_weight

            # 介入前後の拡散インパクト計測
            if action in ["RETWEET", "REPLY"]:
                if intervention_round and current_round >= intervention_round:
                    summary["intervention_impact"]["post_spread_count"] += 1
                else:
                    summary["intervention_impact"]["pre_spread_count"] += 1

    # 脆弱性スコア (SVS) の計算
    agent_count = len(set(r.get("agent_id") for r in results))
    max_rounds = max([int(r.get("round", 1)) for r in results]) if results else 1
    max_possible_score = agent_count * max_rounds * retweet_weight
    
    if max_possible_score > 0:
        summary["vulnerability_score"] = round((total_weighted_score / max_possible_score) * 100, 2)

    # リスクレベル判定
    if summary["vulnerability_score"] > 60:
        summary["risk_level"] = "CRITICAL"
    elif summary["vulnerability_score"] > 30:
        summary["risk_level"] = "MEDIUM"

    # 拡散に寄与したトップエージェント
    summary["top_spreaders"] = sorted(spreader_counts.values(), key=lambda x: x["count"], reverse=True)[:3]

    return summary

@app.get("/simulation/{session_id}/analysis")
async def get_simulation_analysis(session_id: str):
    """AIによるシミュレーションの定性分析と対策案を取得します。"""
    docs = db.collection("simulations").where("session_id", "==", session_id).stream()
    results = [doc.to_dict() for doc in docs]
    if not results:
        raise HTTPException(status_code=404, detail="Analysis data not found.")

    # 最初のドキュメントからニュース内容を取得
    news_content = results[0].get("news_content", "Unknown News")

    try:
        return await executor.analyze_simulation_results(news_content, results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Analysis failed: {str(e)}")

@app.get("/agents", response_model=List[Agent])
async def get_agents():
    """登録されている全エージェントを取得します。"""
    docs = db.collection("agents").stream()
    agents = [Agent(**doc.to_dict()) for doc in docs]
    return agents

@app.post("/agents", response_model=Agent)
async def create_agent(agent: Agent):
    """新しいエージェントを登録します。"""
    try:
        if not agent.agent_id:
            agent.agent_id = f"agent_{uuid.uuid4().hex[:8]}"
        db.collection("agents").document(agent.agent_id).set(agent.dict())
        return agent
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create agent: {str(e)}")

@app.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """指定されたエージェントを削除します。"""
    try:
        db.collection("agents").document(agent_id).delete()
        return {"status": "success", "message": f"Agent {agent_id} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete agent: {str(e)}")

@app.get("/trends")
async def get_external_trends():
    """
    外部SNS（モック）から現在のトレンドトピックを取得します。
    本来は X API や Google News API 等と連携します。
    """
    return [
        {"id": 1, "topic": "生成AIのセキュリティ脆弱性が報告される", "category": "Tech"},
        {"id": 2, "topic": "大手飲料メーカーの製品に異物混入の疑い", "category": "Social"},
        {"id": 3, "topic": "政府、デジタル資産に関する新しい規制案を発表", "category": "Politics"},
        {"id": 4, "topic": "世界的テック企業、大規模な人員削減を計画か", "category": "Business"},
        {"id": 5, "topic": "新種のサイバー攻撃により一部のインフラが停止", "category": "Emergency"}
    ]

# フロントエンドのビルド成果物(dist/)が存在する場合、静的ファイルとして配信する
# (Cloud Run上ではAPIとフロントエンドを単一サービスで提供するため)
if os.path.isdir("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="frontend")