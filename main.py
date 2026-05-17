import os
import asyncio
from datetime import datetime, timezone
import uuid
from fastapi import FastAPI, HTTPException
from google.cloud import firestore
from models import Agent, AgentPersona, SimulationRequest, SimulationResult
from scenarios import SCENARIOS, get_scenario
from agent_executor import SocialAgentExecutor

app = FastAPI(title="Social Chaos Monkey MVP")

# 本来はGoogle Cloudコンソールや環境変数から取得
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "your-project-id")
executor = SocialAgentExecutor(project_id=PROJECT_ID)
db = firestore.Client(project=PROJECT_ID)

@app.post("/simulate", response_model=list[SimulationResult])
async def start_simulation(request: SimulationRequest):
    session_id = str(uuid.uuid4())

    # Determine the news content based on the request
    news_content_to_simulate: str
    if request.scenario_key:
        news_content_to_simulate = get_scenario(request.scenario_key)
        if news_content_to_simulate == "指定されたシナリオが見つかりません。": # Check for scenario not found
            raise HTTPException(status_code=404, detail=f"Scenario '{request.scenario_key}' not found.")
    elif request.news_content:
        news_content_to_simulate = request.news_content
    else:
        # This case should ideally be caught by Pydantic validation, but good for robustness
        raise HTTPException(status_code=400, detail="Either 'news_content' or 'scenario_key' must be provided.")

    async def process_agent(agent: Agent):
        try:
            decision = await executor.decide_action(agent, news_content_to_simulate)
            result = SimulationResult(
                agent_id=agent.agent_id,
                agent_name=agent.name,
                decision=decision,
                status="success"
            )
            
            # Firestoreに結果を保存
            doc_ref = db.collection("simulations").document()
            doc_ref.set({
                "session_id": session_id,
                "timestamp": datetime.now(timezone.utc),
                "news_content": news_content_to_simulate,
                "agent_id": result.agent_id,
                "agent_name": result.agent_name,
                "action": result.decision.action if result.decision else None,
                "emotion": result.decision.internal_emotion if result.decision else None,
                "status": result.status
            })
            
            return result
        except Exception as e:
            return SimulationResult(
                agent_id=agent.agent_id,
                agent_name=agent.name,
                decision=None,
                status=f"error: {str(e)}"
            )

    # Firestoreから全エージェントを取得
    agents_ref = db.collection("agents")
    docs = agents_ref.stream()
    agents = [Agent(**doc.to_dict()) for doc in docs]

    if not agents:
        raise HTTPException(status_code=404, detail="No agents found in Firestore. Run seed_agents.py first.")

    # 取得したすべてのエージェントを並列で実行
    tasks = [process_agent(agent) for agent in agents]
    results = await asyncio.gather(*tasks)
    return results