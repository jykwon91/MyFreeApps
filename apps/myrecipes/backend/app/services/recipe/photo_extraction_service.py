"""AI photo->recipe extraction (Claude vision).

Synchronous by design: the ``POST /recipes/extract`` handler calls
:func:`extract_recipe_from_photo`, gets back an editable
:class:`RecipeDraftResponse`, and the user reviews/saves through the normal
``POST /recipes`` create flow. The uploaded image is a transient input — it is
never stored.

This module consumes the shared ``platform_shared.extraction.ExtractionService``
(the Anthropic client, throttle/backoff, and JSON parsing live there). The
domain concerns that live here are: the recipe prompt, image normalization for
the vision API, and defensive coercion of the model's untrusted JSON into the
lenient draft shape.

Photo import is an *optional* feature: when ``ANTHROPIC_API_KEY`` is unset the
service reports ``is_configured() is False`` and the endpoint returns 503 — the
rest of MyRecipes is unaffected (unlike the canonical app, MyRecipes does not
require a Claude key to boot).
"""
from __future__ import annotations

import asyncio
import io
import logging
from typing import Any

from PIL import Image, ImageOps

from platform_shared.core.image_pixel_limit import ensure_within_pixel_limit
from platform_shared.core.image_pixel_limit_error import ImagePixelLimitError
from platform_shared.extraction import (
    AnthropicFailureKind,
    ExtractionError,
    ExtractionNotConfiguredError,
    ExtractionParseError,
    ExtractionService,
)

from app.core.config import settings
from app.core.photo_import_constants import MAX_PHOTO_PIXELS
from app.schemas.recipe.extraction_schemas import (
    DraftIngredient,
    DraftStep,
    RecipeDraftResponse,
)
from app.services.recipe.draft_value_coercion import coerce_minutes, coerce_quantity
from app.services.recipe.recipe_extraction_prompt import RECIPE_EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

# Pin the model explicitly. The model id + the prompt bytes form the prompt-
# cache key, so this is load-bearing — bump it deliberately. Mirrors the
# canonical app's pin (claude-sonnet-4-6: strong vision, cost-appropriate).
_MODEL = "claude-sonnet-4-6"

# Anthropic resizes vision inputs down to ~1568px on the long edge anyway and
# caps per-image bytes; normalizing up front keeps us well under the limit and
# cuts tokens with no loss of legibility. Going smaller would hurt OCR.
_MAX_EDGE_PX = 1568
_JPEG_QUALITY = 90

# Browser-friendly, Anthropic-supported image types we accept from the client.
# (HEIC from iPhones is converted to JPEG by the browser on upload.) Everything
# is re-encoded to JPEG by _normalize_image before the API call regardless.
SUPPORTED_MEDIA_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
# The declared type is whatever the client sent, so decoding is limited too. Otherwise
# Pillow tries every format it knows on the bytes, including ones that hand off to
# Ghostscript or have had memory-safety bugs.
_DECODABLE_FORMATS = ("JPEG", "PNG", "WEBP")

_extraction = ExtractionService(
    api_key=settings.anthropic_api_key,
    model=_MODEL,
    timeout_seconds=settings.claude_timeout_seconds,
)


class PhotoExtractionUnavailableError(RuntimeError):
    """Photo import cannot run right now (not configured, or upstream error).

    Maps to HTTP 503 — distinct from "the photo was unreadable" so the
    frontend can tell the user to try later rather than try a better photo.
    """


class PhotoNotReadableError(RuntimeError):
    """No recipe could be read from the image. Maps to HTTP 422."""


def is_configured() -> bool:
    """True when an Anthropic API key is set (the feature is enabled)."""
    return _extraction.is_configured()


def _normalize_image(file_bytes: bytes) -> bytes:
    """Honor EXIF orientation, downscale to the vision target, re-encode JPEG.

    CPU-bound and blocking, so callers run it in a worker thread. Raises
    ``ImagePixelLimitError`` when the header declares more than
    ``MAX_PHOTO_PIXELS`` (checked before any pixel is decoded), and other
    exceptions on bytes PIL cannot decode (i.e. not a usable image) — the
    caller maps those to "unreadable".
    """
    try:
        opened = Image.open(io.BytesIO(file_bytes), formats=_DECODABLE_FORMATS)
    except Image.DecompressionBombError as exc:
        # Pillow refuses outright at twice its own limit, before our check can run.
        raise ImagePixelLimitError(MAX_PHOTO_PIXELS) from exc
    with opened as img:
        ensure_within_pixel_limit(img.width, img.height, MAX_PHOTO_PIXELS)
        # JPEG only (a no-op for other formats): decode at the smallest DCT scale
        # still at least the target, instead of every pixel. The box is square, so
        # the EXIF rotation below can't make it too small; thumbnail sizes it exactly.
        img.draft("RGB", (_MAX_EDGE_PX, _MAX_EDGE_PX))
        img = ImageOps.exif_transpose(img)  # apply camera rotation
        img = img.convert("RGB")  # flatten alpha / palette -> JPEG-safe
        img.thumbnail((_MAX_EDGE_PX, _MAX_EDGE_PX))  # in-place, keeps aspect ratio
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=_JPEG_QUALITY)
        return out.getvalue()


async def extract_recipe_from_photo(
    file_bytes: bytes, content_type: str
) -> RecipeDraftResponse:
    """Extract an editable recipe draft from a photo. Never persists anything.

    Raises ``ImagePixelLimitError`` for a photo with too many pixels (HTTP 413).
    """
    if not _extraction.is_configured():
        raise PhotoExtractionUnavailableError("Photo import is not configured.")

    try:
        normalized = await asyncio.to_thread(_normalize_image, file_bytes)
    except ImagePixelLimitError:
        raise
    except Exception as exc:  # noqa: BLE001 — any decode failure means "not an image"
        logger.warning("Photo could not be decoded (content_type=%s): %s", content_type, exc)
        raise PhotoNotReadableError("That image could not be read.") from exc

    try:
        resp = await _extraction.extract_document(
            RECIPE_EXTRACTION_PROMPT, normalized, "image/jpeg"
        )
    except ExtractionNotConfiguredError as exc:
        raise PhotoExtractionUnavailableError(str(exc)) from exc
    except ExtractionParseError as exc:
        # Model returned something that wasn't the expected JSON — treat as
        # "couldn't read a recipe" so the user retries with a clearer photo.
        logger.warning("Recipe extraction returned unparseable output: %s", exc)
        raise PhotoNotReadableError("We couldn't read a recipe from that photo.") from exc
    except ExtractionError as exc:
        # Anthropic API/transport failure, already logged with its error.type
        # by the shared service. A request Anthropic rejected (e.g. an image it
        # can't take) is the photo's problem; anything else — busy, timed out,
        # misconfigured — means "try again later", without provider internals.
        logger.warning(
            "Recipe extraction API error: kind=%s type=%s status=%s",
            exc.kind,
            exc.error_type,
            exc.status,
        )
        if exc.kind is AnthropicFailureKind.INPUT_REJECTED:
            raise PhotoNotReadableError("We couldn't read a recipe from that photo.") from exc
        raise PhotoExtractionUnavailableError("The extraction service errored.") from exc

    draft = _coerce_draft(resp.data)
    logger.info(
        "Recipe photo extracted: title=%r ingredients=%d steps=%d tokens=%d",
        draft.title,
        len(draft.ingredients),
        len(draft.steps),
        resp.total_tokens,
    )

    if not draft.title and not draft.ingredients and not draft.steps:
        # The model's documented "no recipe readable" all-empty response.
        raise PhotoNotReadableError("We couldn't read a recipe from that photo.")

    return draft


# ---------------------------------------------------------------------------
# Defensive coercion of the model's JSON into the lenient draft shape.
# The model output is untrusted: wrong types, out-of-range numbers, extra keys,
# and blank rows are all possible. We extract only the keys we know and clean
# each value rather than trusting pydantic validation over the raw dict.
# ---------------------------------------------------------------------------


def _clean_optional_str(value: Any, max_len: int) -> str | None:
    if value is None:
        return None
    text = value.strip() if isinstance(value, str) else str(value).strip()
    if not text:
        return None
    return text[:max_len]


def _clean_required_str(value: Any, max_len: int) -> str:
    return _clean_optional_str(value, max_len) or ""


def _coerce_ingredients(value: Any) -> list[DraftIngredient]:
    if not isinstance(value, list):
        return []
    out: list[DraftIngredient] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        name = _clean_optional_str(item.get("name"), 255)
        if not name:  # drop nameless rows (e.g. section headers the model leaked)
            continue
        out.append(
            DraftIngredient(
                name=name,
                quantity=coerce_quantity(item.get("quantity")),
                unit=_clean_optional_str(item.get("unit"), 50),
                note=_clean_optional_str(item.get("note"), 255),
            )
        )
    return out


def _coerce_steps(value: Any) -> list[DraftStep]:
    if not isinstance(value, list):
        return []
    out: list[DraftStep] = []
    for item in value:
        if isinstance(item, dict):
            instruction = _clean_optional_str(item.get("instruction"), 5000)
        elif isinstance(item, str):  # tolerate a bare-string step
            instruction = _clean_optional_str(item, 5000)
        else:
            instruction = None
        if instruction:
            out.append(DraftStep(instruction=instruction))
    return out


def _coerce_draft(data: Any) -> RecipeDraftResponse:
    if not isinstance(data, dict):
        return RecipeDraftResponse()
    return RecipeDraftResponse(
        title=_clean_required_str(data.get("title"), 255),
        description=_clean_optional_str(data.get("description"), 5000),
        source=_clean_optional_str(data.get("source"), 1000),
        servings=_clean_optional_str(data.get("servings"), 50),
        prep_minutes=coerce_minutes(data.get("prep_minutes")),
        cook_minutes=coerce_minutes(data.get("cook_minutes")),
        ingredients=_coerce_ingredients(data.get("ingredients")),
        steps=_coerce_steps(data.get("steps")),
    )
