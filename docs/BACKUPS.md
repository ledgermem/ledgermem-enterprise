# Backups & Restore

## Daily logical backup

Run via cron (host crontab, not container):

```bash
# /etc/cron.daily/ledgermem-backup
#!/bin/sh
set -e
BACKUP_DIR=/var/backups/ledgermem
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
docker exec ledgermem-enterprise-postgres-1 \
  pg_dump -U postgres -Fc -d ledgermem \
  > "$BACKUP_DIR/ledgermem-$TIMESTAMP.dump"
# keep last 14 days
find "$BACKUP_DIR" -name 'ledgermem-*.dump' -mtime +14 -delete
```

## Off-site (S3-compatible)

```bash
aws s3 cp "$BACKUP_DIR/ledgermem-$TIMESTAMP.dump" \
  "s3://your-bucket/ledgermem/" \
  --storage-class STANDARD_IA
```

Use a bucket lifecycle rule to transition to Glacier after 30 days.

## Restore

```bash
docker compose stop api worker
docker exec -i ledgermem-enterprise-postgres-1 \
  pg_restore -U postgres -d ledgermem -c -1 < ledgermem-YYYYMMDD-HHMMSS.dump
docker compose start api worker
```

## Point-in-time recovery (PITR)

For < 1 minute RPO, swap the bundled Postgres for managed Postgres
(Neon, RDS, Cloud SQL) which gives you continuous WAL archiving for free.
Update `MEMORY_API_DATABASE_URL` in `.env`, drop the `postgres` service from
`docker-compose.yml`, restart.

## Disaster-recovery drill

Practice the restore monthly against a scratch volume:

```bash
docker volume create ledgermem-test-restore
docker run --rm -v ledgermem-test-restore:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=test pgvector/pgvector:pg16 &
# wait for ready
docker exec -i <container> pg_restore -U postgres -d postgres -C < latest.dump
```

If a drill fails, file an incident — your backups are theatre, not infrastructure.
