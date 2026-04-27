# Air-Gapped Install

LedgerMem Enterprise can run without any outbound internet access. Everything
that would normally call OpenAI, Bedrock, Resend, or Stripe is either
disabled or routed to a local equivalent.

## What changes when `LEDGERMEM_AIR_GAPPED=1`

| External call | Air-gapped behaviour |
|---|---|
| OpenAI chat | Routes to `OLLAMA_BASE_URL` (default `http://ollama:11434`) |
| OpenAI embeddings | Routes to local Ollama embedding model |
| AWS Bedrock | Disabled at boot |
| Resend (email) | Disabled — no signup confirmation emails sent |
| Stripe | Disabled — `ALLOW_STRIPE_STUB_KEY=1` forced on |
| OpenTelemetry exporter | Defaults to local OTLP collector if configured |
| Sentry | Disabled |

The license-key check still runs locally (the JWT signature is verified
against a public key bundled in the image — no network call needed).

## Add Ollama to the compose file

Append to `docker-compose.yml`:

```yaml
  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama-data:/root/.ollama

volumes:
  ollama-data:
```

Then in `.env`:

```
LEDGERMEM_AIR_GAPPED=1
USE_OLLAMA_FOR_CHAT=true
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:32b
OPENAI_EMBEDDING_MODEL=nomic-embed-text
```

## Loading the image without internet

On a connected machine:

```bash
docker pull ghcr.io/ledgermem/memory-api:0.7.0
docker save ghcr.io/ledgermem/memory-api:0.7.0 -o ledgermem-api-0.7.0.tar
# transfer the tar to the air-gapped host
```

On the air-gapped host:

```bash
docker load -i ledgermem-api-0.7.0.tar
```

## Verifying air-gap compliance

```bash
docker compose exec api env | grep -E 'OPENAI|RESEND|STRIPE|SENTRY'
# All should be empty or disabled flags.

# Confirm no outbound calls during a search
sudo iptables -A OUTPUT -p tcp --dport 443 -j LOG --log-prefix "LM_OUT "
docker compose exec api curl -s http://localhost:4100/v1/search ...
sudo dmesg | grep LM_OUT
# Should show no entries.
```
