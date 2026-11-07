"""The idempotent upload loop every WoW image publish script shares."""
from __future__ import annotations

from collections.abc import Callable, Sequence

from scripts.wow_assets.asset_bucket import AssetBucket

PROGRESS_EVERY = 100


def upload_missing(
    items: Sequence[tuple[str, Callable[[], bytes]]],
    bucket: AssetBucket | None,
) -> dict[str, int]:
    """Upload each ``(key, make_body)`` whose key isn't in ``bucket`` yet; ``None`` = dry run.

    ``make_body`` runs only for keys that are actually uploaded, so a re-run
    after a failure only fetches / reads what is left. Returns the counts.
    """
    counts = {"uploaded": 0, "present": 0, "would-upload": 0, "bytes": 0}
    for i, (key, make_body) in enumerate(items, 1):
        if bucket is None:
            counts["would-upload"] += 1
            continue
        if bucket.exists(key):
            counts["present"] += 1
            continue
        body = make_body()
        bucket.put(key, body)
        counts["uploaded"] += 1
        counts["bytes"] += len(body)
        if i % PROGRESS_EVERY == 0:
            print(f"  ... {i}/{len(items)}", flush=True)
    return counts


def report(counts: dict[str, int]) -> str:
    """The one-line summary a publish script prints at the end."""
    return (
        f"done: uploaded={counts['uploaded']} ({counts['bytes'] // 1024} KB) "
        f"already-there={counts['present']} would-upload={counts['would-upload']}"
    )
