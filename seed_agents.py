import os
from google.cloud import firestore
from models import Agent, AgentPersona

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "ml-agent-otsuka-202605")
db = firestore.Client(project=PROJECT_ID)

def seed():
    agents_data = [
        Agent(
            agent_id="agent_001",
            name="タカシ@情報通",
            persona=AgentPersona(gullibility=0.8, influence=0.6, interests=["テクノロジー", "ゴシップ"], political_bias="Neutral"),
            following=["agent_002"]
        ),
        Agent(
            agent_id="agent_002",
            name="冷静な専門家",
            persona=AgentPersona(gullibility=0.1, influence=0.9, interests=["科学", "教育"], political_bias="Conservative"),
            following=[]
        ),
        Agent(
            agent_id="agent_003",
            name="拡散希望bot風ユーザー",
            persona=AgentPersona(gullibility=0.9, influence=0.3, interests=["トレンド", "ニュース"], political_bias="Liberal"),
            following=["agent_001"]
        ),
        Agent(
            agent_id="agent_004",
            name="疑い深い主婦",
            persona=AgentPersona(gullibility=0.4, influence=0.2, interests=["生活", "健康"], political_bias="Neutral"),
            following=["agent_001", "agent_002"]
        )
    ]

    print(f"🚀 Seeding agents to project: {PROJECT_ID}...")
    for agent in agents_data:
        db.collection("agents").document(agent.agent_id).set(agent.model_dump())
        print(f"  ✅ Seeded: {agent.name}")

    print("\n✨ Seeding complete. You now have a dynamic agent pool in Firestore.")

if __name__ == "__main__":
    seed()