import os
import json
import asyncio
from datetime import datetime, timezone
from typing import Dict
import threading
from google.cloud import pubsub_v1, firestore
from models import Agent, AgentPersona, SimulationResult, AgentAction
from agent_executor import SocialAgentExecutor

# 環境変数からプロジェクトIDを取得
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "your-project-id")

# Pub/SubとFirestoreクライアントの初期化
subscriber = pubsub_v1.SubscriberClient()
publisher = pubsub_v1.PublisherClient()
db = firestore.Client(project=PROJECT_ID)
# グローバルで初期化し、スレッド開始前のレースコンディションを防止
executor = SocialAgentExecutor(project_id=PROJECT_ID)

# ワーカーループ用の共有イベントループ
loop = asyncio.new_event_loop()

# Pub/Subのトピックとサブスクリプション名
TOPIC_NAME = f"projects/{PROJECT_ID}/topics/social-chaos-monkey-simulation"
SUBSCRIPTION_NAME = f"projects/{PROJECT_ID}/subscriptions/social-chaos-monkey-subscription"

async def process_agent_message(message_data: Dict):
    session_id = message_data["session_id"]
    current_round = message_data["round"]
    total_rounds = message_data.get("total_rounds", 1)
    total_agents = message_data.get("total_agents", 1)
    news_content_to_simulate = message_data["news_content"]
    agent_id = message_data["agent_id"]
    intervention_content = message_data.get("intervention_content")
    intervention_round = message_data.get("intervention_round")

    print(f"Processing agent {agent_id} for session {session_id}, round {current_round}")

    # エージェント情報をFirestoreから取得
    agent_doc = db.collection("agents").document(agent_id).get()
    if not agent_doc.exists:
        print(f"Agent {agent_id} not found in Firestore.")
        return
    agent = Agent(**agent_doc.to_dict())

    # 過去の反応履歴と個人履歴をFirestoreから取得
    # ここでは簡略化のため、そのセッションの全履歴からフィルタリング
    # 本来はエージェントのフォロー関係を考慮したタイムラインを構築する必要がある
    # 複合インデックスエラーを回避するためメモリ上でソートを行います
    past_results_query = db.collection("simulations").where("session_id", "==", session_id).stream()
    past_results = [doc.to_dict() for doc in past_results_query]
    past_results.sort(key=lambda x: x.get("timestamp", ""))

    social_context_parts = []
    personal_history_parts = []

    for res in past_results:
        if res["round"] < current_round: # 現在のラウンドより前のものだけを考慮
            if res["agent_id"] == agent_id: # 自分の過去の行動
                personal_history_parts.append(
                    f"Round {res['round']}: I decided to {res.get('action', 'UNKNOWN')}. Emotion: {res.get('emotion', 'UNKNOWN')}"
                )
            elif res["agent_id"] in agent.following: # フォローしている人の行動
                if res.get("action") != "IGNORE":
                    social_context_parts.append(
                        f"Round {res['round']} - {res['agent_name']}: {res.get('reply_content') or res.get('action')}"
                    )
    
    social_context = "Reactions from people you follow:\n" + "\n".join(social_context_parts) if social_context_parts else "No reactions yet."
    personal_history = "Your Past Actions in this session:\n" + "\n".join(personal_history_parts) if personal_history_parts else "You haven't posted anything yet."

    # 介入（パッチ）の投入チェック
    if intervention_content and intervention_round and current_round >= intervention_round:
        social_context += f"\n\n*** OFFICIAL ANNOUNCEMENT / FACT CHECK ***\n{intervention_content}"

    try:
        decision = await executor.decide_action(agent, news_content_to_simulate, social_context, personal_history)
        result_status = "success"
    except Exception as e:
        print(f"Error processing agent {agent_id}: {e}")
        decision = AgentAction(action="IGNORE", internal_emotion=f"System Error: {str(e)}")
        result_status = f"error: {str(e)}"

    # Firestoreに結果を保存
    doc_ref = db.collection("simulations").document()
    doc_data = {
        "session_id": session_id,
        "round": current_round,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "news_content": news_content_to_simulate,
        "agent_id": agent.agent_id,
        "agent_name": agent.name,
        "status": result_status,
        "action": decision.action,
        "reply_content": decision.reply_content,
        "emotion": decision.internal_emotion
    }
    doc_ref.set(doc_data)
    print(f"Agent {agent_id} for session {session_id}, round {current_round} processed and saved.")

    # --- 連鎖ロジック: ラウンド内の全員が終わったら次のラウンドを発火 ---
    # 進捗管理ドキュメントを使用してレースコンディションを防止
    progress_ref = db.collection("simulation_progress").document(f"{session_id}_{current_round}")
    progress_ref.set({"count": firestore.Increment(1)}, merge=True)
    
    progress = progress_ref.get().to_dict()
    if progress.get("count") == total_agents and current_round < total_rounds:
        print(f"Round {current_round} complete for session {session_id}. Triggering Round {current_round + 1}...")
        
        # 次のラウンドのためのエージェントリスト取得
        agents_docs = db.collection("agents").stream()
        for doc in agents_docs:
            next_message = message_data.copy()
            next_message["round"] = current_round + 1
            next_message["agent_id"] = doc.id
            publisher.publish(TOPIC_NAME, json.dumps(next_message).encode("utf-8"))
    elif progress.get("count") == total_agents and current_round == total_rounds:
        # 全ラウンドが完全に終了
        print(f"Simulation {session_id} completely finished.")
        db.collection("sessions").document(session_id).update({"status": "completed"})

def callback(message: pubsub_v1.subscriber.message.Message) -> None:
    message_data = json.loads(message.data.decode("utf-8"))
    # 共有ループにコルーチンをスケジュール（スレッドセーフ）
    asyncio.run_coroutine_threadsafe(process_agent_message(message_data), loop)
    message.ack()

def main():
    # 非同期ループを別スレッドで実行
    def start_loop(l):
        asyncio.set_event_loop(l)
        l.run_forever()
    
    t = threading.Thread(target=start_loop, args=(loop,), daemon=True)
    t.start()

    print(f"Listening for messages on {SUBSCRIPTION_NAME}...")
    streaming_pull_future = subscriber.subscribe(SUBSCRIPTION_NAME, callback=callback)
    
    # メインスレッドを維持
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        streaming_pull_future.cancel()
        loop.call_soon_threadsafe(loop.stop)
        print("\nStopping worker gracefully...")

if __name__ == "__main__":
    main()