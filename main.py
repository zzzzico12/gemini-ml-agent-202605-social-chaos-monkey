import os
import asyncio
from datetime import datetime, timezone
import uuid
from typing import List, Dict
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

@app.post("/simulate", response_model=SimulationResponse)
async def start_simulation(request: SimulationRequest):
    """
    指定されたニュースまたはシナリオに基づき、複数ラウンドの自律拡散シミュレーションを実行します。
    """
    session_id = str(uuid.uuid4())
    news_content_to_simulate = ""

    if request.scenario_key:
        news_content_to_simulate = get_scenario(request.scenario_key)
        if news_content_to_simulate == "指定されたシナリオが見つかりません。": # Check for scenario not found
            raise HTTPException(status_code=404, detail=f"Scenario '{request.scenario_key}' not found.")
    elif request.news_content:
        news_content_to_simulate = request.news_content
    else:
        raise HTTPException(status_code=400, detail="Either 'news_content' or 'scenario_key' must be provided.")

    async def process_agent(agent: Agent, current_round: int, context: str, history: str) -> SimulationResult:
        try:
            decision = await executor.decide_action(agent, news_content_to_simulate, context, history)
            result = SimulationResult(
                session_id=session_id,
                agent_id=agent.agent_id,
                agent_name=agent.name,
                decision=decision,
                round=current_round,
                status="success"
            )
        except Exception as e:
            result = SimulationResult(
                session_id=session_id,
                agent_id=agent.agent_id,
                agent_name=agent.name,
                round=current_round,
                decision=None,
                status=f"error: {str(e)}"
            )
        
        # Firestoreに結果を保存 (成功・失敗共に行う)
        doc_ref = db.collection("simulations").document()
        doc_data = {
            "session_id": session_id,
            "round": current_round,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "news_content": news_content_to_simulate,
            "agent_id": result.agent_id,
            "agent_name": result.agent_name,
            "status": result.status
        }
        if result.decision:
            doc_data.update({
                "action": result.decision.action,
                "reply_content": result.decision.reply_content,
                "emotion": result.decision.internal_emotion
            })
        doc_ref.set(doc_data)
        
        return result

    # Firestoreから全エージェントを取得
    agents_ref = db.collection("agents")
    docs = agents_ref.stream()
    agents = [Agent(**doc.to_dict()) for doc in docs]

    if not agents:
        raise HTTPException(status_code=404, detail="No agents found in Firestore. Run seed_agents.py first.")

    all_results: List[SimulationResult] = []
    # agent_id -> そのエージェントが見ているタイムライン（履歴）
    reactions_history: Dict[str, List[str]] = {agent.agent_id: [] for agent in agents}
    # agent_id -> そのエージェント自身の過去の言動
    personal_histories: Dict[str, List[str]] = {agent.agent_id: [] for agent in agents}

    for r in range(1, request.rounds + 1):
        tasks = []
        for agent in agents:
            # 自分がフォローしているエージェントの反応のみをコンテキストとして抽出
            followed_reactions = []
            for followed_id in agent.following:
                if followed_id in reactions_history:
                    followed_reactions.extend(reactions_history[followed_id])
            
            context_parts = []
            if followed_reactions:
                context_parts.append("Reactions from people you follow:\n" + "\n".join(followed_reactions))
            
            # 介入（パッチ）の投入チェック
            if request.intervention_content and request.intervention_round and r >= request.intervention_round:
                context_parts.append(f"*** OFFICIAL ANNOUNCEMENT / FACT CHECK ***\n{request.intervention_content}")

            context = "\n\n".join(context_parts)
            history = "\n".join(personal_histories[agent.agent_id])
            
            tasks.append(process_agent(agent, r, context, history))
        
        round_results = await asyncio.gather(*tasks)
        all_results.extend(round_results)

        # 次のラウンドのために履歴を更新
        for res in round_results:
            if res.decision and res.decision.action != "IGNORE":
                reaction_desc = f"Round {r} - {res.agent_name}: {res.decision.reply_content or res.decision.action}"
                reactions_history[res.agent_id].append(reaction_desc)
                
                # 個人履歴を更新
                personal_histories[res.agent_id].append(
                    f"Round {r}: I decided to {res.decision.action}. Emotion: {res.decision.internal_emotion}"
                )

    return SimulationResponse(
        session_id=session_id,
        results_url=f"/simulation/{session_id}",
        results=all_results
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