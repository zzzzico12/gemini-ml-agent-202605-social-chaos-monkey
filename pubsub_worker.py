import os
import asyncio
import json
import threading
from google.cloud import pubsub_v1
from agent_worker import process_agent_message

# 環境変数からプロジェクトIDを取得
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "your-project-id")

# Pub/Subクライアントの初期化
subscriber = pubsub_v1.SubscriberClient()

# ワーカーループ用の共有イベントループ
loop = asyncio.new_event_loop()

SUBSCRIPTION_NAME = f"projects/{PROJECT_ID}/subscriptions/social-chaos-monkey-subscription"


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
