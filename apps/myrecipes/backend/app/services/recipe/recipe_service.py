"""Recipe domain service — orchestration for recipes, versions, and cook logs.

Layered architecture: routes -> services -> repositories. Services load via
repos, decide, persist via repos, and commit; mappers convert ORM -> DTO; the
pure diff engine computes version differences. Every public function takes
``user_id`` and forwards it to tenant-scoped repo queries (defense in depth).

The version model is the product's core: a recipe always has a "current"
version = its latest. A tweak creates a NEW immutable version (copying the
base's content forward, then applying edits). Restore copies an old version
forward as a new latest version, so history is never rewritten.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe.cook_log import CookLog
from app.models.recipe.recipe import Recipe
from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion
from app.repositories.recipe import (
    cook_log_repository,
    recipe_repository,
    recipe_version_repository,
)
from app.schemas.recipe.cook_log_schemas import CookLogCreateRequest, CookLogResponse
from app.schemas.recipe.diff_schemas import DiffResponse
from app.schemas.recipe.recipe_schemas import (
    RecipeCreateRequest,
    RecipeDetailResponse,
    RecipeSummary,
    RecipeUpdateRequest,
)
from app.schemas.recipe.version_schemas import (
    IngredientInput,
    StepInput,
    VersionCreateRequest,
    VersionResponse,
    VersionSummary,
)
from app.services.recipe import recipe_mappers, version_diff


class InvalidBaseVersionError(ValueError):
    """Raised when a tweak/diff references a base version that doesn't exist
    for this recipe. The route maps it to HTTP 400."""


# ---------------------------------------------------------------------------
# Snapshot builders (pure)
# ---------------------------------------------------------------------------


def _make_ingredients(
    version_id: uuid.UUID, inputs: list[IngredientInput],
) -> list[RecipeIngredient]:
    return [
        RecipeIngredient(
            version_id=version_id,
            lineage_key=ing.lineage_key or uuid.uuid4(),
            position=i,
            name=ing.name,
            quantity=ing.quantity,
            unit=ing.unit,
            note=ing.note,
        )
        for i, ing in enumerate(inputs, start=1)
    ]


def _make_steps(version_id: uuid.UUID, inputs: list[StepInput]) -> list[RecipeStep]:
    return [
        RecipeStep(version_id=version_id, position=i, instruction=s.instruction)
        for i, s in enumerate(inputs, start=1)
    ]


async def _build_detail(
    db: AsyncSession, recipe: Recipe, user_id: uuid.UUID,
) -> RecipeDetailResponse:
    """Assemble a recipe's detail DTO (summary rollups + full latest version).

    Reads see flushed-but-uncommitted rows, so callers may invoke this before
    committing a write.
    """
    versions = await recipe_version_repository.list_by_recipe(db, recipe.id, user_id)
    latest = versions[-1] if versions else None
    best_map = await cook_log_repository.best_rating_and_last_cooked_by_recipe(
        db, [recipe.id]
    )
    best_rating, last_cooked = best_map.get(recipe.id, (None, None))

    latest_dto: VersionResponse | None = None
    if latest is not None:
        ingredients = await recipe_version_repository.get_ingredients(db, latest.id)
        steps = await recipe_version_repository.get_steps(db, latest.id)
        latest_dto = recipe_mappers.to_version_response(latest, ingredients, steps)

    return RecipeDetailResponse(
        id=recipe.id,
        user_id=recipe.user_id,
        title=recipe.title,
        description=recipe.description,
        source=recipe.source,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
        version_count=len(versions),
        latest_version_number=latest.version_number if latest else None,
        best_rating=best_rating,
        last_cooked_at=last_cooked,
        latest_version=latest_dto,
    )


# ---------------------------------------------------------------------------
# Recipe CRUD
# ---------------------------------------------------------------------------


async def create_recipe(
    db: AsyncSession, user_id: uuid.UUID, req: RecipeCreateRequest,
) -> RecipeDetailResponse:
    """Create a recipe and its first version (v1) atomically."""
    recipe = Recipe(
        user_id=user_id,
        title=req.title.strip(),
        description=req.description,
        source=req.source,
    )
    await recipe_repository.create(db, recipe)

    version = RecipeVersion(
        recipe_id=recipe.id,
        user_id=user_id,
        version_number=1,
        parent_version_id=None,
        change_note=None,
        servings=req.servings,
        prep_minutes=req.prep_minutes,
        cook_minutes=req.cook_minutes,
    )
    await recipe_version_repository.create(db, version)
    await recipe_version_repository.add_ingredients(
        db, _make_ingredients(version.id, req.ingredients)
    )
    await recipe_version_repository.add_steps(db, _make_steps(version.id, req.steps))

    detail = await _build_detail(db, recipe, user_id)
    await db.commit()
    return detail


async def list_recipes(
    db: AsyncSession, user_id: uuid.UUID, *, search: str | None = None,
) -> list[RecipeSummary]:
    recipes = await recipe_repository.list_by_user(db, user_id, search=search)
    recipe_ids = [r.id for r in recipes]
    counts = await recipe_version_repository.counts_and_latest_by_recipe(db, recipe_ids)
    cooks = await cook_log_repository.best_rating_and_last_cooked_by_recipe(db, recipe_ids)

    summaries: list[RecipeSummary] = []
    for r in recipes:
        version_count, latest_number = counts.get(r.id, (0, None))
        best_rating, last_cooked = cooks.get(r.id, (None, None))
        summaries.append(
            RecipeSummary(
                id=r.id,
                user_id=r.user_id,
                title=r.title,
                description=r.description,
                source=r.source,
                created_at=r.created_at,
                updated_at=r.updated_at,
                version_count=version_count,
                latest_version_number=latest_number,
                best_rating=best_rating,
                last_cooked_at=last_cooked,
            )
        )
    return summaries


async def get_recipe_detail(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID,
) -> RecipeDetailResponse | None:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    return await _build_detail(db, recipe, user_id)


async def update_recipe(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID, req: RecipeUpdateRequest,
) -> RecipeDetailResponse | None:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    updates = req.model_dump(exclude_unset=True)
    if updates:
        await recipe_repository.update(db, recipe, updates)
    detail = await _build_detail(db, recipe, user_id)
    await db.commit()
    return detail


async def delete_recipe(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID,
) -> bool:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return False
    await recipe_repository.soft_delete(db, recipe)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Versions (the tweak history)
# ---------------------------------------------------------------------------


async def list_versions(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID,
) -> list[VersionSummary] | None:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    versions = await recipe_version_repository.list_by_recipe(db, recipe_id, user_id)
    agg = await cook_log_repository.counts_and_best_by_version(
        db, [v.id for v in versions]
    )
    return [
        VersionSummary(
            id=v.id,
            version_number=v.version_number,
            change_note=v.change_note,
            created_at=v.created_at,
            cook_count=agg.get(v.id, (0, None))[0],
            best_rating=agg.get(v.id, (0, None))[1],
        )
        for v in versions
    ]


async def get_version(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID, version_id: uuid.UUID,
) -> VersionResponse | None:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    version = await recipe_version_repository.get_by_id(db, version_id, user_id)
    if version is None or version.recipe_id != recipe_id:
        return None
    ingredients = await recipe_version_repository.get_ingredients(db, version.id)
    steps = await recipe_version_repository.get_steps(db, version.id)
    return recipe_mappers.to_version_response(version, ingredients, steps)


async def create_version(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID, req: VersionCreateRequest,
) -> VersionResponse | None:
    """Create a new version (a tweak). Returns None if the recipe is missing.

    Raises InvalidBaseVersionError if ``base_version_id`` is given but doesn't
    belong to this recipe.
    """
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None

    base: RecipeVersion | None
    if req.base_version_id is not None:
        base = await recipe_version_repository.get_by_id(db, req.base_version_id, user_id)
        if base is None or base.recipe_id != recipe_id:
            raise InvalidBaseVersionError("base_version_id is not a version of this recipe")
    else:
        base = await recipe_version_repository.get_latest(db, recipe_id, user_id)

    next_number = await recipe_version_repository.max_version_number(db, recipe_id) + 1
    version = RecipeVersion(
        recipe_id=recipe_id,
        user_id=user_id,
        version_number=next_number,
        parent_version_id=base.id if base else None,
        change_note=req.change_note,
        # Inherit the base's servings/timing when the tweak doesn't restate them.
        servings=req.servings if req.servings is not None else (base.servings if base else None),
        prep_minutes=req.prep_minutes if req.prep_minutes is not None else (base.prep_minutes if base else None),
        cook_minutes=req.cook_minutes if req.cook_minutes is not None else (base.cook_minutes if base else None),
    )
    await recipe_version_repository.create(db, version)

    ingredients = _make_ingredients(version.id, req.ingredients)
    steps = _make_steps(version.id, req.steps)
    await recipe_version_repository.add_ingredients(db, ingredients)
    await recipe_version_repository.add_steps(db, steps)

    dto = recipe_mappers.to_version_response(version, ingredients, steps)
    await db.commit()
    return dto


async def restore_version(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID, version_id: uuid.UUID,
) -> VersionResponse | None:
    """Copy an old version forward as a new latest version (history-preserving)."""
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    source = await recipe_version_repository.get_by_id(db, version_id, user_id)
    if source is None or source.recipe_id != recipe_id:
        return None

    source_ingredients = await recipe_version_repository.get_ingredients(db, source.id)
    source_steps = await recipe_version_repository.get_steps(db, source.id)

    next_number = await recipe_version_repository.max_version_number(db, recipe_id) + 1
    new_version = RecipeVersion(
        recipe_id=recipe_id,
        user_id=user_id,
        version_number=next_number,
        parent_version_id=source.id,
        change_note=f"Restored from v{source.version_number}",
        servings=source.servings,
        prep_minutes=source.prep_minutes,
        cook_minutes=source.cook_minutes,
    )
    await recipe_version_repository.create(db, new_version)

    # Copy snapshots forward — NEW rows, SAME lineage_key so the diff against the
    # restored version reads cleanly.
    new_ingredients = [
        RecipeIngredient(
            version_id=new_version.id,
            lineage_key=src.lineage_key,
            position=src.position,
            name=src.name,
            quantity=src.quantity,
            unit=src.unit,
            note=src.note,
        )
        for src in source_ingredients
    ]
    new_steps = [
        RecipeStep(version_id=new_version.id, position=src.position, instruction=src.instruction)
        for src in source_steps
    ]
    await recipe_version_repository.add_ingredients(db, new_ingredients)
    await recipe_version_repository.add_steps(db, new_steps)

    dto = recipe_mappers.to_version_response(new_version, new_ingredients, new_steps)
    await db.commit()
    return dto


async def diff_versions(
    db: AsyncSession,
    user_id: uuid.UUID,
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    against_id: uuid.UUID | None = None,
) -> DiffResponse | None:
    """Diff ``version_id`` against ``against_id`` (default: its parent version)."""
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    to_version = await recipe_version_repository.get_by_id(db, version_id, user_id)
    if to_version is None or to_version.recipe_id != recipe_id:
        return None

    if against_id is not None:
        from_version = await recipe_version_repository.get_by_id(db, against_id, user_id)
        if from_version is None or from_version.recipe_id != recipe_id:
            raise InvalidBaseVersionError("against version is not a version of this recipe")
    elif to_version.parent_version_id is not None:
        from_version = await recipe_version_repository.get_by_id(
            db, to_version.parent_version_id, user_id
        )
    else:
        from_version = None  # v1 — nothing precedes it; everything is "added".

    to_ingredients = await recipe_version_repository.get_ingredients(db, to_version.id)
    to_steps = await recipe_version_repository.get_steps(db, to_version.id)

    if from_version is None:
        from_ingredients: list[RecipeIngredient] = []
        from_steps: list[RecipeStep] = []
    else:
        from_ingredients = await recipe_version_repository.get_ingredients(db, from_version.id)
        from_steps = await recipe_version_repository.get_steps(db, from_version.id)

    return DiffResponse(
        from_version_id=from_version.id if from_version else None,
        from_version_number=from_version.version_number if from_version else None,
        to_version_id=to_version.id,
        to_version_number=to_version.version_number,
        ingredient_changes=version_diff.diff_ingredients(from_ingredients, to_ingredients),
        step_changes=version_diff.diff_steps(from_steps, to_steps),
    )


# ---------------------------------------------------------------------------
# Cook logs
# ---------------------------------------------------------------------------


async def log_cook(
    db: AsyncSession,
    user_id: uuid.UUID,
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    req: CookLogCreateRequest,
) -> CookLogResponse | None:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    version = await recipe_version_repository.get_by_id(db, version_id, user_id)
    if version is None or version.recipe_id != recipe_id:
        return None

    cook = CookLog(
        version_id=version_id,
        user_id=user_id,
        cooked_at=req.cooked_at or datetime.now(timezone.utc),
        rating=req.rating,
        outcome_notes=req.outcome_notes,
    )
    await cook_log_repository.create(db, cook)
    dto = recipe_mappers.to_cook_log_response(cook)
    await db.commit()
    return dto


async def list_cooks(
    db: AsyncSession,
    user_id: uuid.UUID,
    recipe_id: uuid.UUID,
    version_id: uuid.UUID | None = None,
) -> list[CookLogResponse] | None:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return None
    if version_id is not None:
        cooks = await cook_log_repository.list_by_version(db, version_id, user_id)
    else:
        cooks = await cook_log_repository.list_by_recipe(db, recipe_id, user_id)
    return [recipe_mappers.to_cook_log_response(c) for c in cooks]


async def delete_cook(
    db: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID, cook_id: uuid.UUID,
) -> bool:
    recipe = await recipe_repository.get_by_id(db, recipe_id, user_id)
    if recipe is None:
        return False
    cook = await cook_log_repository.get_by_id(db, cook_id, user_id)
    if cook is None:
        return False
    await cook_log_repository.delete(db, cook)
    await db.commit()
    return True
