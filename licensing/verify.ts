/**
 * License-key verifier.
 *
 * LedgerMem Enterprise customers receive a signed JWT after Stripe checkout.
 * The API container verifies it on boot using the public key bundled below.
 * This file lives in `ledgermem-enterprise` for transparency: customers can
 * audit exactly what's being checked.
 *
 * The actual runtime check happens inside `memory-infrastructure-api`'s
 * bootstrap (src/license/license.guard.ts in the v0.7+ image). This script
 * is a CLI you can run locally to debug license rejections without booting
 * the whole stack.
 *
 * Run with:
 *   npx ts-node verify.ts $LEDGERMEM_LICENSE_KEY
 */

import { createPublicKey, createVerify } from 'node:crypto'

const LEDGERMEM_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
REPLACE_WITH_REAL_KEY_AT_PUBLISH_TIME
-----END PUBLIC KEY-----`

export type LicenseClaims = {
  /** RFC 7519 — issued at, in seconds since epoch */
  iat: number
  /** Expiration. Hard cutoff. */
  exp: number
  /** Customer org name as it appears on the invoice. */
  org: string
  /** Tier purchased. */
  tier: 'enterprise' | 'enterprise-air-gapped'
  /** Maximum concurrent workspaces (0 = unlimited). */
  workspace_limit: number
  /** Optional regex of permitted hostnames the API will respond on. */
  hostname_allow?: string
  /** Stripe customer ID for support correlation. */
  stripe_customer_id: string
}

export type VerifyResult =
  | { ok: true; claims: LicenseClaims }
  | { ok: false; reason: string }

export function verifyLicense(
  jwt: string,
  publicKeyPem = LEDGERMEM_PUBLIC_KEY_PEM,
  now: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed JWT (expected header.payload.signature)' }
  }
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string]

  let header: { alg?: string; typ?: string }
  let payload: LicenseClaims & Record<string, unknown>
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString('utf8'))
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
  } catch (err) {
    return { ok: false, reason: `invalid JSON: ${(err as Error).message}` }
  }

  if (header.alg !== 'RS256') {
    return { ok: false, reason: `unexpected alg: ${header.alg ?? 'missing'} (want RS256)` }
  }

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${headerB64}.${payloadB64}`)
  const publicKey = createPublicKey(publicKeyPem)
  const valid = verifier.verify(publicKey, b64urlDecode(sigB64))
  if (!valid) {
    return { ok: false, reason: 'signature mismatch — license not issued by LedgerMem' }
  }

  if (typeof payload.exp !== 'number') {
    return { ok: false, reason: 'missing exp claim' }
  }
  if (payload.exp < now) {
    const expired = new Date(payload.exp * 1000).toISOString()
    return { ok: false, reason: `license expired ${expired}` }
  }

  return { ok: true, claims: payload }
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

// CLI entry-point
if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.argv[2] ?? process.env.LEDGERMEM_LICENSE_KEY
  if (!key) {
    process.stderr.write('Usage: ts-node verify.ts <jwt>  (or set LEDGERMEM_LICENSE_KEY)\n')
    process.exit(2)
  }
  const result = verifyLicense(key)
  if (result.ok) {
    process.stdout.write(`✓ valid · org=${result.claims.org} · tier=${result.claims.tier} · exp=${new Date(result.claims.exp * 1000).toISOString()}\n`)
    process.exit(0)
  }
  process.stderr.write(`✗ invalid: ${result.reason}\n`)
  process.exit(1)
}
