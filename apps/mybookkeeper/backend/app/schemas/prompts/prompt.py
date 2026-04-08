from pydantic import BaseModel


class PromptResponse(BaseModel):
    id: str
    name: str
    prompt_text: str
    mode: str
    is_active: bool
    user_id: str | None
    created_at: str


class CreatePromptRequest(BaseModel):
    name: str
    prompt_text: str
    mode: str = "extend"
    is_active: bool = True
