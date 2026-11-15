"""One page of ``GET /recipes`` plus how many rows match in all."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.recipe.recipe_schemas import RecipeSummary


class RecipeListPage(ListResponse[RecipeSummary]):
    """``items`` is this page; ``total`` counts every matching row across pages; ``has_more`` says another page follows."""
