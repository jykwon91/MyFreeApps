import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.extraction.extraction_prompt import ExtractionPrompt


async def get_active_for_user(db: AsyncSession, user_id: uuid.UUID) -> ExtractionPrompt | None:
    """Get the active user-specific prompt."""
    result = await db.execute(
        select(ExtractionPrompt)
        .where(ExtractionPrompt.is_active.is_(True), ExtractionPrompt.user_id == user_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    name: str,
    prompt_text: str,
    is_active: bool = False,
    user_id: uuid.UUID | None = None,
    mode: str = "override",
) -> ExtractionPrompt:
    prompt = ExtractionPrompt(
        name=name, prompt_text=prompt_text, is_active=is_active,
        user_id=user_id, mode=mode,
    )
    db.add(prompt)
    await db.flush()
    return prompt


async def set_active(db: AsyncSession, prompt_id: uuid.UUID) -> ExtractionPrompt | None:
    """Activate a prompt, deactivating others in the same scope (system or user)."""
    result = await db.execute(
        select(ExtractionPrompt).where(ExtractionPrompt.id == prompt_id)
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        return None

    # Deactivate others in the same scope
    scope_filter = ExtractionPrompt.user_id == prompt.user_id if prompt.user_id else ExtractionPrompt.user_id.is_(None)
    await db.execute(
        update(ExtractionPrompt).where(scope_filter).values(is_active=False)
    )
    prompt.is_active = True
    return prompt


async def list_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[ExtractionPrompt]:
    """List all prompts for a user (both system and user-specific)."""
    result = await db.execute(
        select(ExtractionPrompt)
        .where((ExtractionPrompt.user_id == user_id) | ExtractionPrompt.user_id.is_(None))
        .order_by(ExtractionPrompt.created_at.desc())
    )
    return list(result.scalars().all())
