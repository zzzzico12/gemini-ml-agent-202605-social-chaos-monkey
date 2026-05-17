from pydantic import BaseModel, model_validator
from typing import List, Literal, Optional

class AgentPersona(BaseModel):
    gullibility: float  # デマの信じやすさ (0.0 - 1.0)
    influence: float    # 影響力スコア
    interests: List[str]
    political_bias: str

class Agent(BaseModel):
    agent_id: str
    name: str
    persona: AgentPersona
    following: List[str] = []

class AgentAction(BaseModel):
    action: Literal["RETWEET", "REPLY", "IGNORE"]
    reply_content: Optional[str] = None
    internal_emotion: str

class SimulationRequest(BaseModel):
    news_content: Optional[str] = None
    scenario_key: Optional[str] = None
    rounds: int = 1
    target_agents: Optional[List[str]] = None
    intervention_content: Optional[str] = None
    intervention_round: Optional[int] = None

    # Pydantic v2 validator to ensure either news_content or scenario_key is provided, but not both
    @model_validator(mode='after')
    def check_at_least_one_content_source(self) -> 'SimulationRequest':
        if not self.news_content and not self.scenario_key:
            raise ValueError("Either 'news_content' or 'scenario_key' must be provided.")
        if self.news_content and self.scenario_key:
            raise ValueError("Cannot provide both 'news_content' and 'scenario_key'. Choose one.")
        return self

class SimulationResult(BaseModel):
    session_id: str
    agent_id: str
    agent_name: str
    decision: Optional[AgentAction] = None
    round: int = 1
    status: str

class SimulationResponse(BaseModel):
    session_id: str
    results_url: str
    results: List[SimulationResult]