# LedgerMem Enterprise

Self-hosting infrastructure for [LedgerMem Memory](https://proofly.dev) — Docker Compose for single-node, Helm chart (coming) for Kubernetes, license verifier, runbooks.

## What's in here

```
docker-compose.yml          single-node compose (api + worker + postgres+pgvector + redis)
postgres/init.sql           pgvector + pg_trgm extensions on first boot
observability/              optional Prometheus + Grafana profile
licensing/verify.ts         CLI to validate your license JWT before booting
docs/INSTALL.md             15-minute install runbook
docs/BACKUPS.md             pg_dump cadence, S3 lifecycle, restore drill
docs/AIR_GAPPED.md          air-gapped mode + Ollama swap-in
helm/                       Kubernetes chart (TODO — v0.2)
```

## Who this is for

Companies on the **Enterprise** plan who want LedgerMem running in their own
VPC for compliance, residency, or air-gap reasons. The container images are
private (GitHub Container Registry, credentials issued at onboarding).

## Quick start

See [docs/INSTALL.md](docs/INSTALL.md). Tl;dr:

```bash
git clone https://github.com/ledgermem/ledgermem-enterprise.git
cd ledgermem-enterprise
cp .env.example .env
# fill in LEDGERMEM_LICENSE_KEY + secrets
docker compose up -d
```

## License verification

The API container refuses to boot with an invalid or expired license. You can
also verify out-of-band:

```bash
npx -y ts-node licensing/verify.ts "$LEDGERMEM_LICENSE_KEY"
```

Public key is bundled at `licensing/verify.ts` for full transparency — anyone
can audit exactly what's being checked.

## License (for this repo)

The IaC + docs are MIT. The container images themselves are governed by your
LedgerMem Enterprise agreement.
