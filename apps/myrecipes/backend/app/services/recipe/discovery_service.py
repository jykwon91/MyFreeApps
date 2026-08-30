"""Recipe discovery — find the best versions of a dish on the open web.

Two calls, deliberately split:

``search_recipes("mexican flan")``
    One Claude turn with the server-side ``web_search`` tool: several
    searches across publications, blogs, YouTube and Reddit, returning a
    browse-able list. Wide and comparatively cheap.

``read_recipe(url, title)``
    One Claude turn with ``web_fetch``: reads the page the user picked and
    returns a full, editable draft plus the context around it. Deep and paid
    for only when someone actually opens a card.

Doing both in one call was the alternative — it would return everything up
front and make the click instant. It was rejected because it pays for a full
read of 8 pages to answer a question about one, and the list is the part
users abandon most.

Nothing is persisted. A saved discovery becomes an ordinary recipe through
the normal ``POST /recipes`` create flow, which is why the detail response
carries the same ``RecipeDraftResponse`` photo import produces — the review
editor is already built.

Like photo import, discovery is *optional*: with no ``ANTHROPIC_API_KEY`` the
service reports ``is_configured() is False`` and the endpoints return 503.
The rest of MyRecipes is unaffected.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any

from platform_shared.extraction import (
    ExtractionError,
    ExtractionNotConfiguredError,
    ExtractionParseError,
    ResearchService,
)
from platform_shared.core.url_safety import UnsafeURLError, assert_url_safe

from app.core.config import settings
from app.schemas.recipe.discovery_schemas import (
    DiscoveredDetail,
    DiscoveredRecipe,
    DiscoveryResults,
)
from app.schemas.recipe.extraction_schemas import (
    DraftIngredient,
    DraftStep,
    RecipeDraftResponse,
)
from app.services.recipe import discovery_image_service
from app.services.recipe.discovery_prompts import (
    DISCOVERY_DETAIL_PROMPT,
    DISCOVERY_DETAIL_SCHEMA,
    DISCOVERY_SEARCH_PROMPT,
    DISCOVERY_SEARCH_SCHEMA,
)

logger = logging.getLogger(__name__)

# Pinned explicitly — the model id plus the prompt bytes form the prompt-cache
# key, so this is load-bearing. Discovery is a judgement task (which of these
# versions is actually worth cooking) over attacker-influenced text, which is
# where the strongest model earns its cost; photo import stays on
# claude-sonnet-4-6 because OCR is not that task.
_MODEL = "claude-opus-5"

# Effort is the first cost lever. Search is breadth-shaped — read a lot,
# judge briefly — so it runs at medium. The detail read has to transcribe
# quantities exactly and not "improve" them, so it gets the default high.
_SEARCH_EFFORT = "medium"
_DETAIL_EFFORT = "high"

# Cost ceilings per call. The model is told to search several times; these cap
# what a single request can spend if it decides to keep going.
_MAX_SEARCHES = 8
_MAX_FETCHES = 3

_MAX_RESULTS = 8

_research = ResearchService(
    api_key=settings.anthropic_api_key,
    model=_MODEL,
    timeout_seconds=settings.claude_timeout_seconds,
)


class DiscoveryUnavailableError(RuntimeError):
    """Discovery cannot run right now (not configured, or upstream error).

    Maps to HTTP 503 — retryable, distinct from "nothing found".
    """


class DiscoveryFailedError(RuntimeError):
    """The research turn produced nothing usable. Maps to HTTP 422."""


def is_configured() -> bool:
    """True when an Anthropic API key is set (the feature is enabled)."""
    return _research.is_configured()


# ---------------------------------------------------------------------------
# Step 1 — search
# ---------------------------------------------------------------------------


async def search_recipes(query: str) -> DiscoveryResults:
    """Search the web for the best versions of ``query``."""
    cleaned = query.strip()
    if not cleaned:
        raise DiscoveryFailedError("Tell us what you'd like to cook.")

    response = await _run(
        lambda: _research.search(
            DISCOVERY_SEARCH_PROMPT,
            f"Find the best versions of this dish: {cleaned}",
            json_schema=DISCOVERY_SEARCH_SCHEMA,
            max_searches=_MAX_SEARCHES,
            effort=_SEARCH_EFFORT,
        ),
        what="recipe search",
    )

    recipes, raw_images = _coerce_results(response.data)
    await _attach_thumbnails(recipes, raw_images)
    logger.info(
        "Recipe discovery: query=%r results=%d searches=%d tokens=%d",
        cleaned,
        len(recipes),
        response.server_tool_uses,
        response.total_tokens,
    )
    if not recipes:
        raise DiscoveryFailedError(
            "We couldn't find recipes for that. Try a dish name, like "
            "'mexican flan'."
        )
    return DiscoveryResults(query=cleaned, recipes=recipes)


# ---------------------------------------------------------------------------
# Step 2 — read one result
# ---------------------------------------------------------------------------


async def read_recipe(url: str, title: str = "") -> DiscoveredDetail:
    """Read one discovered page in full and return an editable draft.

    ``url`` arrives from the client, so it is untrusted regardless of having
    been in a previous response: it is SSRF-validated here before it is put
    in a prompt that will cause a fetch.
    """
    target = url.strip()
    try:
        await assert_url_safe(target)
    except UnsafeURLError:
        # Propagate — the route maps ValueError to 400. Do not echo the URL
        # back to the caller; it is their input and they already have it.
        logger.warning("Rejected unsafe discovery detail URL")
        raise

    named = f" (titled {title.strip()!r})" if title.strip() else ""
    response = await _run(
        lambda: _research.read_page(
            DISCOVERY_DETAIL_PROMPT,
            f"Read this recipe page{named} and return the full recipe: {target}",
            json_schema=DISCOVERY_DETAIL_SCHEMA,
            max_fetches=_MAX_FETCHES,
            effort=_DETAIL_EFFORT,
        ),
        what="recipe read",
    )

    detail, raw_image = _coerce_detail(response.data, url=target, title=title)
    detail.image_url = await discovery_image_service.resolve_thumbnail(
        raw_image, page_url=target
    )
    detail.sources = [source.url for source in response.sources][:10]
    logger.info(
        "Recipe detail read: url_host=%s ingredients=%d steps=%d tokens=%d",
        _host_of(target),
        len(detail.draft.ingredients),
        len(detail.draft.steps),
        response.total_tokens,
    )

    if not detail.draft.ingredients and not detail.draft.steps:
        raise DiscoveryFailedError(
            "We couldn't read a recipe from that page. Try opening it directly."
        )
    return detail


# ---------------------------------------------------------------------------
# Shared plumbing
# ---------------------------------------------------------------------------


async def _run(call, *, what: str):
    """Run a research call, mapping provider failures onto typed app errors."""
    if not _research.is_configured():
        raise DiscoveryUnavailableError("Recipe discovery is not configured.")
    try:
        return await call()
    except ExtractionNotConfiguredError as exc:
        raise DiscoveryUnavailableError(str(exc)) from exc
    except ExtractionParseError as exc:
        logger.warning("%s returned no usable payload: %s", what, exc)
        raise DiscoveryFailedError("We couldn't make sense of the results.") from exc
    except ExtractionError as exc:
        # Log the provider error type/status, surface a retryable 503 — never
        # leak provider internals. See rules/check-third-party-error-codes.md.
        logger.warning(
            "%s API error: type=%s status=%s detail=%s",
            what,
            exc.error_type,
            exc.status,
            exc,
        )
        raise DiscoveryUnavailableError("The discovery service errored.") from exc


def _host_of(url: str) -> str:
    from urllib.parse import urlparse

    return urlparse(url).hostname or "?"


# ---------------------------------------------------------------------------
# Defensive coercion. Structured outputs constrain the model's JSON, but the
# values inside it are still text a stranger's web page influenced — lengths,
# ranges, and URL shapes are all enforced here rather than trusted.
# ---------------------------------------------------------------------------

_SOURCE_TYPES = frozenset(
    {"website", "youtube", "reddit", "blog", "video", "forum"}
)
_DIFFICULTIES = frozenset({"easy", "medium", "hard"})


def _clean_str(value: Any, max_len: int) -> str | None:
    if value is None:
        return None
    text = value.strip() if isinstance(value, str) else str(value).strip()
    if not text:
        return None
    return text[:max_len]


def _clean_int(value: Any, *, maximum: int) -> int | None:
    if isinstance(value, bool):  # bool is an int subclass — reject explicitly
        return None
    if isinstance(value, (int, float)):
        number = int(value)
        return number if 0 <= number <= maximum else None
    return None


def _clean_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value >= 0 else None
    return None


def _clean_http_url(value: Any) -> str | None:
    """A syntactically valid absolute http(s) URL, or None.

    Cheap shape check only. The authoritative validation (DNS + address
    classification) happens at fetch time, since the answer can change
    between now and then.
    """
    from urllib.parse import urlparse

    text = _clean_str(value, 2000)
    if text is None:
        return None
    try:
        parsed = urlparse(text)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    return text


def _host_is(host: str, domain: str) -> bool:
    """True for ``domain`` and its subdomains only.

    A bare ``host.endswith(domain)`` also accepts ``evilyoutube.com``, which
    would let a page anyone can register wear the YouTube badge. The leading
    dot is what makes it a domain match rather than a string suffix.
    """
    return host == domain or host.endswith(f".{domain}")


def _source_type(value: Any, url: str) -> str:
    """The model's label, corrected against the URL where the URL is definitive."""
    host = _host_of(url).lower().removeprefix("www.")
    if _host_is(host, "youtube.com") or host == "youtu.be":
        return "youtube"
    if _host_is(host, "reddit.com"):
        return "reddit"
    label = value if isinstance(value, str) else ""
    return label if label in _SOURCE_TYPES else "website"


def _result_id(url: str) -> str:
    """A stable id for one result, so the UI never routes on array position."""
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def _coerce_results(data: Any) -> tuple[list[DiscoveredRecipe], list[str | None]]:
    """Coerce the model's results, plus its raw image guess for each one.

    The picture is deliberately NOT resolved here: getting the best one needs
    network I/O per result (see ``_attach_thumbnails``), and mixing that into
    a pure coercion pass would make it serial. Every returned recipe leaves
    this function with ``image_url=None``, so a caller that forgets the second
    pass ships placeholder tiles rather than leaking a raw third-party URL the
    CSP would block anyway.
    """
    if isinstance(data, dict):
        raw = data.get("recipes")
    elif isinstance(data, list):  # tolerate a bare array
        raw = data
    else:
        return [], []
    if not isinstance(raw, list):
        return [], []

    out: list[DiscoveredRecipe] = []
    raw_images: list[str | None] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        url = _clean_http_url(item.get("url"))
        title = _clean_str(item.get("title"), 300)
        if not url or not title:
            continue  # a result you cannot open, or cannot name, is not a result
        if url in seen:
            continue
        seen.add(url)

        difficulty = item.get("difficulty")
        raw_images.append(_clean_http_url(item.get("image_url")))
        out.append(
            DiscoveredRecipe(
                id=_result_id(url),
                title=title,
                source_type=_source_type(item.get("source_type"), url),
                site_name=_clean_str(item.get("site_name"), 120),
                url=url,
                image_url=None,  # filled in by _attach_thumbnails
                summary=_clean_str(item.get("summary"), 600) or "",
                why_notable=_clean_str(item.get("why_notable"), 400),
                # 3 days — long enough for a cure or a proof, short enough to
                # catch a model that emitted milliseconds.
                total_minutes=_clean_int(item.get("total_minutes"), maximum=4320),
                difficulty=(
                    difficulty if difficulty in _DIFFICULTIES else None
                ),
            )
        )
        if len(out) >= _MAX_RESULTS:
            break
    return out, raw_images


async def _attach_thumbnails(
    recipes: list[DiscoveredRecipe], raw_images: list[str | None]
) -> None:
    """Fill in each result's picture, all of them at once.

    One bounded page read per result, run concurrently: serially this would
    add seconds to a search the user is already waiting on, in parallel it
    adds roughly one page load. Resolution never raises — a result whose
    picture cannot be found keeps ``image_url=None`` and renders a
    placeholder.
    """
    if not recipes:
        return
    paths = await asyncio.gather(
        *(
            discovery_image_service.resolve_thumbnail(raw, page_url=recipe.url)
            for recipe, raw in zip(recipes, raw_images, strict=True)
        )
    )
    for recipe, path in zip(recipes, paths, strict=True):
        recipe.image_url = path


def _coerce_ingredients(value: Any) -> list[DraftIngredient]:
    if not isinstance(value, list):
        return []
    out: list[DraftIngredient] = []
    for item in value[:100]:
        if not isinstance(item, dict):
            continue
        name = _clean_str(item.get("name"), 255)
        if not name:  # drop nameless rows (e.g. leaked section headers)
            continue
        out.append(
            DraftIngredient(
                name=name,
                quantity=_clean_float(item.get("quantity")),
                unit=_clean_str(item.get("unit"), 50),
                note=_clean_str(item.get("note"), 255),
            )
        )
    return out


def _coerce_steps(value: Any) -> list[DraftStep]:
    if not isinstance(value, list):
        return []
    out: list[DraftStep] = []
    for item in value[:100]:
        if isinstance(item, dict):
            instruction = _clean_str(item.get("instruction"), 5000)
        elif isinstance(item, str):  # tolerate a bare-string step
            instruction = _clean_str(item, 5000)
        else:
            instruction = None
        if instruction:
            out.append(DraftStep(instruction=instruction))
    return out


def _coerce_draft(data: Any, *, fallback_title: str) -> RecipeDraftResponse:
    if not isinstance(data, dict):
        return RecipeDraftResponse(title=fallback_title)
    return RecipeDraftResponse(
        title=_clean_str(data.get("title"), 255) or fallback_title,
        description=_clean_str(data.get("description"), 5000),
        source=_clean_str(data.get("source"), 1000),
        servings=_clean_str(data.get("servings"), 50),
        prep_minutes=_clean_int(data.get("prep_minutes"), maximum=4320),
        cook_minutes=_clean_int(data.get("cook_minutes"), maximum=4320),
        ingredients=_coerce_ingredients(data.get("ingredients")),
        steps=_coerce_steps(data.get("steps")),
    )


def _coerce_note_list(value: Any, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:limit]:
        note = _clean_str(item, 600)
        if note:
            out.append(note)
    return out


def _coerce_detail(
    data: Any, *, url: str, title: str
) -> tuple[DiscoveredDetail, str | None]:
    """As ``_coerce_results``, returning the model's raw image guess separately."""
    payload = data if isinstance(data, dict) else {}
    fallback = _clean_str(title, 300) or "Untitled recipe"
    detail = DiscoveredDetail(
        title=_clean_str(payload.get("title"), 300) or fallback,
        source_type=_source_type(payload.get("source_type"), url),
        site_name=_clean_str(payload.get("site_name"), 120),
        url=url,
        image_url=None,  # resolved by the caller (network I/O)
        summary=_clean_str(payload.get("summary"), 1000) or "",
        draft=_coerce_draft(payload.get("draft"), fallback_title=fallback),
        tips=_coerce_note_list(payload.get("tips"), limit=10),
        community_notes=_coerce_note_list(payload.get("community_notes"), limit=10),
    )
    return detail, _clean_http_url(payload.get("image_url"))
