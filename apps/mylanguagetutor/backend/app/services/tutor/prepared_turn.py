"""A turn that passed its checks and holds its quota reservation, ready to stream."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.services.tutor import quota_service
from app.services.tutor.prompt_builder import ClaudeRequest, TurnPromptContext


@dataclass
class PreparedTurn:
    turn_id: uuid.UUID
    seq: int
    session_id: uuid.UUID
    user_id: uuid.UUID
    prompt: TurnPromptContext
    reply_request: ClaudeRequest
    corrections_request: ClaudeRequest
    reservation: quota_service.Reservation
