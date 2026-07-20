"""Local operator tool: copy accepted-lineup clip bytes from local MinIO → Cloudflare R2.

Reads the committed pack (``data/lineup_library.json``) to learn exactly which
object keys the imported library references — the 6 public keys per lineup
(stand/aim screenshots + throw/landing/stand/aim clips) — then streams each
from the local MinIO bucket to the prod R2 bucket. Run at deploy time AFTER
``export_lineup_pack.py`` regenerated the pack. Clips can be published any
time relative to ``import-lineups``; the library just renders broken media
until the bytes are in R2.

Idempotent: each key is overwritten by its deterministic name, so re-running
after a partial failure is safe. Only keys the pack references are copied —
operator-only ``*_original`` / trim sources never leave the local box.

SOURCE creds come from the local ``backend/.env`` (``MINIO_*`` via app settings).
DEST (R2) creds come from the ENVIRONMENT — never pass them on the command line
or paste them in chat (rules/never-paste-secrets-in-chat):

    R2_ENDPOINT   = <account>.r2.cloudflarestorage.com   (host only, no scheme)
    R2_ACCESS_KEY = <R2 S3 token access key id>
    R2_SECRET_KEY = <R2 S3 token secret>
    R2_BUCKET     = <R2 bucket name>

Run from the backend dir with the app venv:
  # preview what would copy (source only — no R2 creds needed):
  .venv\\Scripts\\python.exe scripts\\publish_clips_to_r2.py --dry-run
  # real publish (set R2 creds in the shell first):
  $env:R2_ENDPOINT="..."; $env:R2_ACCESS_KEY="..."; $env:R2_SECRET_KEY="..."; $env:R2_BUCKET="..."
  .venv\\Scripts\\python.exe scripts\\publish_clips_to_r2.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from minio import Minio  # noqa: E402
from minio.error import S3Error  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.game.lineup_exporter import PUBLIC_OBJECT_KEY_FIELDS  # noqa: E402
from app.services.game.lineup_url_signing import _object_key_from_value  # noqa: E402

_PACK_PATH = ROOT / "data" / "lineup_library.json"


def _source_client() -> tuple[Minio, str]:
    """Local MinIO client + bucket from app settings (backend/.env)."""
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    return client, settings.minio_bucket


def _r2_client() -> tuple[Minio, str]:
    """R2 client + bucket from env. Exits with a clear message if unset."""
    endpoint = os.environ.get("R2_ENDPOINT", "").strip()
    access = os.environ.get("R2_ACCESS_KEY", "").strip()
    secret = os.environ.get("R2_SECRET_KEY", "").strip()
    bucket = os.environ.get("R2_BUCKET", "").strip()
    missing = [
        name
        for name, value in (
            ("R2_ENDPOINT", endpoint),
            ("R2_ACCESS_KEY", access),
            ("R2_SECRET_KEY", secret),
            ("R2_BUCKET", bucket),
        )
        if not value
    ]
    if missing:
        raise SystemExit(
            "Missing R2 env var(s): "
            + ", ".join(missing)
            + " — set them in the shell (never in chat). See this script's docstring."
        )
    # R2's S3 API is always HTTPS and SigV4 (the minio client default).
    client = Minio(endpoint, access_key=access, secret_key=secret, secure=True)
    return client, bucket


def _collect_keys(pack: dict) -> list[str]:
    """Every distinct, non-null public object key in the pack, peeled to the
    bare key (defends against a historically URL-corrupted column — the bare
    key is what the read path requests from R2)."""
    keys: set[str] = set()
    for lineup in pack.get("lineups", []):
        for field in PUBLIC_OBJECT_KEY_FIELDS:
            value = lineup.get(field)
            if value:
                keys.add(_object_key_from_value(value))
    return sorted(keys)


def _copy_key(src, src_bucket, dst, dst_bucket, key: str, *, dry_run: bool) -> str:
    """Return one of: 'copied' | 'would-copy' | 'missing'."""
    try:
        stat = src.stat_object(src_bucket, key)
    except S3Error as exc:
        if exc.code in ("NoSuchKey", "NoSuchObject", "NoSuchBucket"):
            return "missing"
        raise
    if dry_run:
        return "would-copy"
    response = src.get_object(src_bucket, key)
    try:
        dst.put_object(
            dst_bucket,
            key,
            response,
            length=stat.size,
            content_type=stat.content_type or "application/octet-stream",
        )
    finally:
        response.close()
        response.release_conn()
    return "copied"


def main() -> int:
    dry_run = "--dry-run" in sys.argv[1:]

    if not _PACK_PATH.is_file():
        raise SystemExit(
            f"pack not found: {_PACK_PATH} — run export_lineup_pack.py first."
        )
    pack = json.loads(_PACK_PATH.read_text(encoding="utf-8"))
    keys = _collect_keys(pack)

    src, src_bucket = _source_client()
    dst, dst_bucket = (None, None) if dry_run else _r2_client()

    prefix = "DRY RUN: would publish" if dry_run else "Publishing"
    dest_desc = "R2[<dry-run>]" if dry_run else f"R2[{dst_bucket}]"
    print(f"{prefix} {len(keys)} object(s) from MinIO[{src_bucket}] -> {dest_desc}")

    counts = {"copied": 0, "would-copy": 0, "missing": 0}
    missing: list[str] = []
    for key in keys:
        outcome = _copy_key(src, src_bucket, dst, dst_bucket, key, dry_run=dry_run)
        counts[outcome] += 1
        if outcome == "missing":
            missing.append(key)
        print(f"  [{outcome}] {key}")

    print(
        f"\nDone: copied={counts['copied']} "
        f"would-copy={counts['would-copy']} missing={counts['missing']}"
    )
    if missing:
        print(
            f"WARNING: {len(missing)} key(s) absent from local MinIO[{src_bucket}] — "
            "regenerate clips (backfill-*) or re-export the pack before publishing:"
        )
        for key in missing:
            print(f"   - {key}")
        # Non-zero exit so the operator notices; re-running retries.
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
