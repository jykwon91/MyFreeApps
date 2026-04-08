"""Extraction prompt management service."""
import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.extraction.extraction_prompt import ExtractionPrompt
from app.repositories import extraction_prompt_repo


async def get_my_prompt(user_id: uuid.UUID) -> ExtractionPrompt | None:
    async with AsyncSessionLocal() as db:
        return await extraction_prompt_repo.get_active_for_user(db, user_id)


async def update_my_prompt(
    user_id: uuid.UUID,
    name: str,
    prompt_text: str,
    mode: str,
    is_active: bool,
) -> ExtractionPrompt:
    async with unit_of_work() as db:
        prompt = await extraction_prompt_repo.create(
            db, name=name, prompt_text=prompt_text,
            is_active=False, user_id=user_id, mode=mode,
        )
        if is_active:
            await extraction_prompt_repo.set_active(db, prompt.id)
        return prompt


async def delete_my_prompt(user_id: uuid.UUID) -> None:
    async with unit_of_work() as db:
        prompt = await extraction_prompt_repo.get_active_for_user(db, user_id)
        if prompt:
            prompt.is_active = False


async def list_prompts(user_id: uuid.UUID) -> list[ExtractionPrompt]:
    async with AsyncSessionLocal() as db:
        return list(await extraction_prompt_repo.list_for_user(db, user_id))
