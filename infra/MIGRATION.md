# MinIO migration: per-app → shared infra stack

This is a one-time, operator-driven migration. After it lands, MBK and
MJH (and future apps) all consume `myfreeapps-minio` from
`infra/docker-compose.yml` instead of each spinning up their own.

## Pre-migration checks

- [ ] Verify a recent MBK MinIO backup exists (the data migration
      below is rsync-equivalent and reversible, but a backup is
      cheap insurance).
- [ ] Note the current MBK MinIO root user + root password. They
      must be re-used in `infra/.env` so existing object keys remain
      accessible.

## Steps (run on the VPS as root)

```bash
cd /srv/myfreeapps

# 1. Build /srv/myfreeapps/infra/.env by copying the existing values
#    out of MBK's compose env — MUST reuse the same MINIO_ROOT_USER /
#    PASSWORD / KMS_SECRET_KEY so the existing data + signing keys
#    decode correctly under the new container.
cat > infra/.env <<EOF
MINIO_ROOT_USER=$(grep '^MINIO_ROOT_USER=' apps/mybookkeeper/.env | cut -d= -f2-)
MINIO_ROOT_PASSWORD=$(grep '^MINIO_ROOT_PASSWORD=' apps/mybookkeeper/.env | cut -d= -f2-)
MINIO_KMS_SECRET_KEY=$(grep '^MINIO_KMS_SECRET_KEY=' apps/mybookkeeper/.env | cut -d= -f2-)
MINIO_BROWSER_URL=http://localhost:9001
EOF
chmod 600 infra/.env

# 2. Stop MBK so its MinIO container releases the volume.
docker compose -f apps/mybookkeeper/docker-compose.yml down

# 3. Copy the existing volume's contents into the new shared volume.
#    Both volumes are named docker volumes; addressed by name regardless
#    of which compose project owns them.
docker volume create myfreeapps_minio_data
docker run --rm \
  -v mybookkeeper_minio_data:/old:ro \
  -v myfreeapps_minio_data:/new \
  alpine sh -c "cp -a /old/. /new/ && echo 'copy complete'"

# 4. Bring up the shared infra stack.
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d

# 5. Verify the data made it across.
docker exec myfreeapps-minio mc alias set local http://127.0.0.1:9000 \
  "$(grep MINIO_ROOT_USER infra/.env | cut -d= -f2-)" \
  "$(grep MINIO_ROOT_PASSWORD infra/.env | cut -d= -f2-)"
docker exec myfreeapps-minio mc ls local/mybookkeeper-files | head -10

# 6. Bring MBK back up — it now joins the shared myfreeapps network
#    and reaches the new minio at myfreeapps-minio:9000.
#    (Requires the matching MBK compose update — PR B.)
docker compose -f apps/mybookkeeper/docker-compose.yml up -d

# 7. Smoke-test MBK end-to-end:
#    - Open the app, view a property's listing photos (existing data)
#    - Upload a new listing photo (verify the write path through the new endpoint)
#    - Open a tenant's lease and view a signed-lease attachment
#    - Send a rent receipt and verify the PDF generates + uploads

# 8. After ~24 hours of stable operation, drop the old volume.
#    The data has been copied, not moved — the original is still
#    intact until you do this.
docker volume rm mybookkeeper_minio_data
```

## Rollback

If anything goes wrong before step 8:

```bash
# Stop the new shared stack
docker compose -f infra/docker-compose.yml down

# Bring MBK back up against its OLD compose (which still references
# mybookkeeper_minio_data — the original volume is intact).
git revert <PR-B-merge-sha>
docker compose -f apps/mybookkeeper/docker-compose.yml up -d
```

After step 8 (volume removal) the rollback path is restore-from-backup.

## What changes for new apps after this lands

Adding a new app to the monorepo means: declare a bucket name (e.g.
`myrestaurantreviews-files`) in the app's config, set MINIO_*
environment variables to point at the shared service, join the
`myfreeapps` external network in the app's compose. The lifespan
bucket-initializer (each app already has one) creates the bucket
idempotently on boot. No new container, no new volume, no key
rotation — the shared service handles all of that.
