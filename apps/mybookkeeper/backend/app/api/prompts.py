from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.prompts.prompt import CreatePromptRequest, PromptResponse
from app.services.extraction import prompt_service

router = APIRouter(prefix="/prompts", tags=["prompts"])


def _to_response(prompt) -> PromptResponse:
    return PromptResponse(
        id=str(prompt.id),
        name=prompt.name,
        prompt_text=prompt.prompt_text,
        mode=prompt.mode,
        is_active=prompt.is_active,
        user_id=str(prompt.user_id) if prompt.user_id else None,
        created_at=prompt.created_at.isoformat(),
    )


@router.get("/mine")
async def get_my_prompt(
    ctx: RequestContext = Depends(current_org_member),
) -> PromptResponse | None:
    """Get the active user-specific extraction prompt."""
    prompt = await prompt_service.get_my_prompt(ctx.user_id)
    if not prompt:
        return None
    return _to_response(prompt)


@router.put("/mine")
async def update_my_prompt(
    body: CreatePromptRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> PromptResponse:
    """Create a new user-specific prompt version and activate it.

    mode="extend" appends user rules to the base code prompt.
    mode="override" is deprecated — user rules should be additive only.
    """
    if body.mode not in ("override", "extend"):
        raise HTTPException(status_code=422, detail="mode must be 'override' or 'extend'")
    prompt = await prompt_service.update_my_prompt(
        ctx.user_id, body.name, body.prompt_text, body.mode, body.is_active,
    )
    return _to_response(prompt)


@router.delete("/mine", status_code=204)
async def delete_my_prompt(
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    """Deactivate and remove the user's custom prompt, reverting to base prompt."""
    await prompt_service.delete_my_prompt(ctx.user_id)


@router.get("")
async def list_prompts(
    ctx: RequestContext = Depends(current_org_member),
) -> list[PromptResponse]:
    """List all prompts for the current user."""
    prompts = await prompt_service.list_prompts(ctx.user_id)
    return [_to_response(p) for p in prompts]
