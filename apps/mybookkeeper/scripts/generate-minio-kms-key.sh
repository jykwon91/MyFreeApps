#!/usr/bin/env bash
# Generates a base64-encoded 32-byte random key for MINIO_KMS_SECRET_KEY.
#
# MinIO's built-in KMS (used for SSE-S3 auto-encryption) requires a master
# key in the format `<key-name>:<base64-secret>`. The key name is arbitrary
# but must match across all MinIO instances that share data — we use `key1`
# as the canonical name so future rotations can use `key2`, `key3`, etc.
#
# Usage:
#   bash apps/mybookkeeper/scripts/generate-minio-kms-key.sh
#   # then paste the output into your .env (or /srv/myfreeapps/.env on the VPS):
#   MINIO_KMS_SECRET_KEY=<paste here>
#
# Rotation: see deploy/MINIO_SETUP.md "Rotation".
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: openssl is required" >&2
    exit 1
fi

key=$(openssl rand -base64 32)
echo "MINIO_KMS_SECRET_KEY=key1:${key}"
