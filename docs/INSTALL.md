# LedgerMem Enterprise — Install Runbook

Single-node Docker Compose install. ~15 minutes start to finish.

## Pre-requisites

- Docker 24+ + Docker Compose v2
- A domain you control (e.g. `api.ledgermem.your-org.com`)
- A reverse proxy that terminates TLS (Caddy, nginx, Traefik, ALB, etc.)
- An OpenAI API key (or AWS Bedrock credentials)
- Your LedgerMem **license key** (sent by email after Stripe checkout)

## 1. Clone

```bash
git clone https://github.com/ledgermem/ledgermem-enterprise.git
cd ledgermem-enterprise
```

## 2. Configure

```bash
cp .env.example .env
# Edit .env and fill in:
#   LEDGERMEM_LICENSE_KEY   (from the welcome email)
#   POSTGRES_PASSWORD       (generate fresh)
#   MEMORY_API_JWT_ACCESS_SECRET   (openssl rand -base64 48)
#   MEMORY_API_JWT_REFRESH_SECRET  (openssl rand -base64 48)
#   OPENAI_API_KEY
```

## 3. Verify license before launch

```bash
npx -y ts-node licensing/verify.ts "$LEDGERMEM_LICENSE_KEY"
# ✓ valid · org=Acme Inc · tier=enterprise · exp=2027-04-27T...
```

If this fails, contact <support@proofly.dev> with the error message.

## 4. Boot

```bash
docker compose up -d
docker compose logs -f api  # watch until you see "API listening on :4100"
```

The API binds to `127.0.0.1:4100`. Point your reverse proxy at it.

## 5. First-run smoke test

```bash
curl -fsS https://api.ledgermem.your-org.com/health/ready
# {"status":"ok","db":"ok","redis":"ok"}
```

## 6. Optional: enable observability stack

```bash
docker compose --profile observability up -d
# Prometheus on :9090, Grafana on :3000
```

## Upgrades

```bash
git pull
docker compose pull
docker compose up -d
```

Migrations run automatically on container start; downtime is typically ~10–30s.

## Air-gapped install

See `docs/AIR_GAPPED.md` (TODO — coming with v0.2). Set
`LEDGERMEM_AIR_GAPPED=1` and configure a local Ollama endpoint.

## Backups

See `docs/BACKUPS.md` for the recommended `pg_dump` cadence and S3-compatible
upload pattern.

## Support

- Email: <support@proofly.dev>
- Slack: shared channel set up at onboarding
- Status: <https://status.proofly.dev>
