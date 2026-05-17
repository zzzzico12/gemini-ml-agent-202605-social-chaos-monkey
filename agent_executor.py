import json
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
from models import Agent, AgentAction

class SocialAgentExecutor:
    def __init__(self, project_id: str, location: str = "us-central1", model_name: str = "gemini-2.5-flash"):
        vertexai.init(project=project_id, location=location)
        self.model = GenerativeModel(model_name)

    async def decide_action(self, agent: Agent, news_content: str, social_context: str = "", personal_history: str = "") -> AgentAction:
        system_instruction = f"""
        You are an AI agent simulating a social media user.
        Your profile:
        - Name: {agent.name}
        - Persona: {agent.persona.model_dump()}
        
        Your Past Actions in this session:
        {personal_history if personal_history else "You haven't posted anything yet."}

        Social Context (What others are saying):
        {social_context if social_context else "No reactions yet."}

        Task:
        Analyze the following news content and decide your reaction.
        Respond ONLY in the following JSON format:
        {{
          "action": "RETWEET" | "REPLY" | "IGNORE",
          "reply_content": "your reply if action is REPLY",
          "internal_emotion": "description of your internal state"
        }}
        """

        prompt = f"News Content: {news_content}"
        
        response = await self.model.generate_content_async(
            [system_instruction, prompt],
            generation_config=GenerationConfig(
                response_mime_type="application/json",
            )
        )

        try:
            # Geminiからのレスポンスをパース
            decision_dict = json.loads(response.text)
            return AgentAction(**decision_dict)
        except Exception as e:
            print(f"Error parsing Gemini response: {e}")
            return AgentAction(
                action="IGNORE", 
                internal_emotion="System Error: Could not process info"
            )