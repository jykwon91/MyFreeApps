"""One page of ``GET /recipes``, how many rows match in all, and where the next page starts."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.recipe.recipe_schemas import RecipeSummary


class RecipeListPage(ListResponse[RecipeSummary]):
    """``items`` is this page; ``total`` counts every matching row across pages; ``has_more`` says another page follows.

    ``next_cursor`` is what to pass as ``cursor`` for that page, and is None on the last page.
    """

    next_cursor: str | None = None
