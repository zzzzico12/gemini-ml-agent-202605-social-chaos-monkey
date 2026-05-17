import os
import json
import asyncio
from datetime import datetime, timezone
import uuid
from typing import List, Dict
from google.cloud import pubsub_v1
from fastapi import FastAPI, HTTPException
from google.cloud import firestore
from models import Agent, AgentPersona, SimulationRequest, SimulationResult, SimulationResponse
from scenarios import SCENARIOS, get_scenario
from agent_executor import SocialAgentExecutor

app = FastAPI(title="Social Chaos Monkey MVP")

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

    return SimulationResponse(
        session_id=session_id,
        results_url=f"/simulation/{session_id}",
        results=[] # 非同期処理のため、ここでは結果は返さない
    )

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

    # SVS計算ロジックはそのまま
    summary = {
        "session_id": session_id,
        "total_actions": len(results),
        "by_round": {},
        "action_counts": {"RETWEET": 0, "REPLY": 0, "IGNORE": 0}
    }

    for r in results:
        round_num = str(r.get("round", 1))
        if round_num not in summary["by_round"]:
            summary["by_round"][round_num] = {"RETWEET": 0, "REPLY": 0, "IGNORE": 0}
        
        action = r.get("action")
        if action in summary["action_counts"]:
            summary["action_counts"][action] += 1
            summary["by_round"][round_num][action] += 1

    return summary