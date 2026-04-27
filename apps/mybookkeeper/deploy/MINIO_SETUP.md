# MinIO Self-Hosted Storage — Setup & Operations

MyBookkeeper uses [MinIO](https://min.io) — an S3-compatible object store —
to hold user-uploaded artifacts (currently listing photos; future:
applicant attachments, expense receipts). MinIO runs in the same Docker
Compose stack as the backend on the production VPS.

This doc covers:
- One-time setup (KMS key, env vars, DNS, host Caddy)
- Verifying SSE auto-encryption is active
- Daily backup story
- Restore from backup
- Rotating the KMS master key

## Architecture

```
              public internet
                    |
              [host Caddy] :443/:80
              /            \
     app.<DOMAIN>           storage.<DOMAIN>
            |                       |
         ----------------- :8094 ----------------
            |                       |
       [docker Caddy] -- routes by Host header --
            |                       |
         api:8000               minio:9000
                                    |
                              minio_data volume
                              (SSE-S3 encrypted at rest)
```

- App (browser) calls `https://app.<DOMAIN>/api/...` → host Caddy → docker Caddy → api:8000
- Backend talks to MinIO over the docker-compose network: `http://minio:9000`
- Backend mints **presigned URLs** signed against the public host
  (`https://storage.<DOMAIN>/<bucket>/<key>?X-Amz-...`)
- Browser fetches photos directly via the presigned URL: host Caddy → docker
  Caddy (matched by `Host: storage.<DOMAIN>`) → minio:9000

Presigned URLs expire after `PRESIGNED_URL_TTL_SECONDS` (default 1 hour).
The bucket itself is **private** — direct anonymous reads return 403.

## Encryption at rest (SSE-S3)

MinIO is configured with `MINIO_KMS_AUTO_ENCRYPTION=on` plus a `MINIO_KMS_SECRET_KEY`
master key. Every object written to the bucket is automatically encrypted
with a per-object data key, which is itself encrypted by the master key.

**Verifying encryption is active** (after first deploy):
```bash
ssh root@<vps>
docker exec mybookkeeper-minio mc admin kms key status local
# Expected output includes "Endpoint: ... " and a Key ID matching the
# `key1` name we use in MINIO_KMS_SECRET_KEY.
```

If `kms key status` reports the key as missing, double-check that
`MINIO_KMS_SECRET_KEY` is set in `/srv/myfreeapps/.env` and the container
was restarted after the env was written.

## One-time deployment setup

These steps must complete on the VPS BEFORE the first deploy that includes
this PR. Until they're done, the API container will start (graceful
degradation in `bucket_initializer.py` keeps startup non-fatal) but photo
uploads will return 503 and listing reads will return `presigned_url=null`.

### 1. Generate a KMS master key (locally)

```bash
bash apps/mybookkeeper/scripts/generate-minio-kms-key.sh
# prints a line of the form: MINIO_KMS_SECRET_KEY=key1:<base64-32-bytes>
```

Save the output line — you'll paste it into `/srv/myfreeapps/.env` next.

### 2. Add MinIO env vars to `/srv/myfreeapps/.env`

SSH into the VPS and add (don't overwrite existing values):

```bash
# Root credentials — used only by the MinIO container itself, never by the app.
MINIO_ROOT_USER=mybookkeeper-admin
MINIO_ROOT_PASSWORD=<generate via: openssl rand -base64 32>

# Master key from step 1
MINIO_KMS_SECRET_KEY=key1:<base64-from-step-1>

# Browser console — only reachable via SSH tunnel (see "Access the console")
MINIO_BROWSER_URL=http://localhost:9001

# App-side credentials — scoped service-account access for the backend.
# These will be REGISTERED as a service account in MinIO in step 6 below;
# generating them here only sets the values, MinIO doesn't know them yet.
#
# IMPORTANT: MinIO service-account access keys must be 3-20 characters and
# secret keys 8-40 characters. Generate with `openssl rand -hex 8` (16 chars)
# and `openssl rand -hex 16` (32 chars) — NOT `openssl rand -hex 24` which
# produces 48-char values that exceed MinIO's limits.
MINIO_ACCESS_KEY=<openssl rand -hex 8>     # 16 chars
MINIO_SECRET_KEY=<openssl rand -hex 16>    # 32 chars
MINIO_ENDPOINT=minio:9000
MINIO_PUBLIC_ENDPOINT=https://storage.<your-domain>
MINIO_BUCKET=mybookkeeper-files
MINIO_SECURE=false
PRESIGNED_URL_TTL_SECONDS=3600
```

### 3. Add a DNS A record for `storage.<your-domain>`

Point `storage.<your-domain>` at the VPS IP (same A record target as
`app.<your-domain>`). Wait for DNS to propagate.

### 4. Add the storage subdomain to host Caddy

Edit `/etc/caddy/Caddyfile` on the VPS and add a block alongside the
existing app block:

```caddy
storage.<your-domain> {
    reverse_proxy 127.0.0.1:8094 {
        header_up Host {host}
        header_up X-Real-IP {remote}
    }
}
```

The `header_up Host {host}` is critical — the docker Caddy uses the
`Host` header to route between the app and storage subdomains.

Reload host Caddy:
```bash
sudo systemctl reload caddy
```

### 5. Start the MinIO container

The `docker compose up -d` triggered by the post-merge deploy will start
MinIO automatically. To bring it up manually before merge:

```bash
cd /srv/myfreeapps/apps/mybookkeeper
docker compose up -d minio
docker compose ps minio   # should report (healthy) within ~30s
```

### 6. Register the app's service account in MinIO

**This step is not optional.** MinIO does NOT auto-create a service account
from the `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` env vars — you have to register
those values explicitly. Without this step, the api container will return
`InvalidAccessKeyId` 500s on every photo upload.

```bash
# Configure mc client with root credentials
docker exec mybookkeeper-minio mc alias set local http://127.0.0.1:9000 \
  "$(grep ^MINIO_ROOT_USER /srv/myfreeapps/apps/mybookkeeper/.env | cut -d= -f2)" \
  "$(grep ^MINIO_ROOT_PASSWORD /srv/myfreeapps/apps/mybookkeeper/.env | cut -d= -f2)"

# Create the service account using the access/secret keys from .env
docker exec mybookkeeper-minio mc admin user svcacct add local \
  "$(grep ^MINIO_ROOT_USER /srv/myfreeapps/apps/mybookkeeper/.env | cut -d= -f2)" \
  --access-key "$(grep ^MINIO_ACCESS_KEY /srv/myfreeapps/apps/mybookkeeper/.env | cut -d= -f2)" \
  --secret-key "$(grep ^MINIO_SECRET_KEY /srv/myfreeapps/apps/mybookkeeper/.env | cut -d= -f2)"

# Verify the service account exists
docker exec mybookkeeper-minio mc admin user svcacct list local \
  "$(grep ^MINIO_ROOT_USER /srv/myfreeapps/apps/mybookkeeper/.env | cut -d= -f2)"
```

If the `svcacct add` step fails with "access key length should be between 3
and 20", your `MINIO_ACCESS_KEY` is too long — regenerate per step 2 with
`openssl rand -hex 8` (NOT `-hex 24`).

### 7. Verify SSE is active

```bash
docker exec mybookkeeper-minio mc admin kms key status local
```

If you see a key listed, encryption-at-rest is working. Confirm by
uploading a test photo via the Listings UI and inspecting the object:

```bash
docker exec mybookkeeper-minio mc stat local/mybookkeeper-files/<some-key>
# Look for: Encryption: AES256 (or similar)
```

### 8. Access the console (optional)

The MinIO web console is bound to `127.0.0.1:9001` for safety. Tunnel via
SSH from your laptop:
```bash
ssh -L 9001:127.0.0.1:9001 root@<vps>
# then open http://localhost:9001 in your browser
# Login with MINIO_ROOT_USER / MINIO_ROOT_PASSWORD
```

## Backup

The MinIO data volume is included in the daily backup script
(`deploy/backup.sh`). The volume is tar'd and gzipped alongside the
PostgreSQL dump, with the same 30-day retention window.

Backups land in `/srv/mybookkeeper/backups/`:
- `mybookkeeper_<timestamp>.sql.gz` — PostgreSQL dump
- `minio_data_<timestamp>.tar.gz` — MinIO data volume snapshot

The MinIO volume is captured live (no quiesce). Inflight writes during the
snapshot may be incomplete in the backup, but MinIO is robust to partial
writes and the worst case is that the very last write at backup time is
lost — every prior write is durable.

## Restore

To restore MinIO data from a backup tarball:

```bash
# 1. Stop the MinIO container (the API will keep running but photo uploads
#    will 503 during the restore).
docker compose -f /srv/myfreeapps/apps/mybookkeeper/docker-compose.yml stop minio

# 2. Wipe the existing volume.
docker volume rm mybookkeeper_minio_data

# 3. Re-create the volume and extract the backup into it.
docker volume create mybookkeeper_minio_data
docker run --rm -v mybookkeeper_minio_data:/data -v /srv/mybookkeeper/backups:/backups alpine \
    sh -c "cd /data && tar xzf /backups/minio_data_<timestamp>.tar.gz"

# 4. Restart MinIO.
docker compose -f /srv/myfreeapps/apps/mybookkeeper/docker-compose.yml up -d minio
```

The KMS master key in `/srv/myfreeapps/.env` MUST be unchanged across the
restore — without the same master key, the encrypted objects are
unrecoverable.

## KMS key rotation

MinIO supports adding a new master key alongside the existing one and
re-encrypting objects with the new key (lazy re-keying on next access).

```bash
# 1. Generate a new key with a new name (key2 if current is key1):
KEY=$(openssl rand -base64 32)
echo "MINIO_KMS_SECRET_KEY=key1:<old-secret>,key2:${KEY}"

# 2. Update /srv/myfreeapps/.env to include BOTH the old and new keys (comma-separated).

# 3. Restart MinIO so it loads the new key:
docker compose restart minio

# 4. (Optional) Re-encrypt existing objects with the new key:
docker exec mybookkeeper-minio mc admin kms rewrap local mybookkeeper-files

# 5. After all objects are re-keyed, you can drop key1 from the env var.
```

**Never** delete the old master key while objects are still encrypted with
it — they become unrecoverable. Always re-key first, then drop.

## Tech reference

- App image: `minio/minio:RELEASE.2025-09-07T16-13-09Z`
  (verified via Docker Hub API on 2026-04-26 — see commit message)
- Default bucket: `mybookkeeper-files` — partitioned by domain prefix
  (`listings/...`, future `applicants/...`)
- Object key format: `<organization_id>/<uuid>/<filename>`
  (see `app.core.storage.StorageClient.generate_key`)
- Presigned URL TTL: 1 hour (configurable via `PRESIGNED_URL_TTL_SECONDS`)
- Bucket policy: private (no public reads — all access via presigned URL)
