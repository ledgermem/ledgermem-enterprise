/**
 * License-key verifier.
 *
 * Mnemo Enterprise customers receive a signed JWT after Stripe checkout.
 * The API container verifies it on boot using the public key bundled below.
 * This file lives in `getmnemo-enterprise` for transparency: customers can
 * audit exactly what's being checked.
 *
 * The actual runtime check happens inside `memory-infrastructure-api`'s
 * bootstrap (src/license/license.guard.ts in the v0.7+ image). This script
 * is a CLI you can run locally to debug license rejections without booting
 * the whole stack.
 *
 * Run with:
 *   npx ts-node verify.ts $GETMNEMO_LICENSE_KEY
 */

import { createPublicKey, createVerify } from 'node:crypto'

const GETMNEMO_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
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

// Allow a small clock-skew window when comparing exp/iat against the local
// clock. Air-gapped customers and on-prem K8s clusters routinely drift a few
// minutes from the issuer's clock, and rejecting a license over a 30s skew
// at the boundary would cause spurious boot failures.
const CLOCK_SKEW_SECONDS = 60

export function verifyLicense(
  jwt: string,
  publicKeyPem = GETMNEMO_PUBLIC_KEY_PEM,
  now: number = Math.floor(Date.now() / 1000),
  clockSkewSeconds: number = CLOCK_SKEW_SECONDS,
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
  if (header.typ !== undefined && header.typ !== 'JWT') {
    return { ok: false, reason: `unexpected typ: ${header.typ}` }
  }

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${headerB64}.${payloadB64}`)
  const publicKey = createPublicKey(publicKeyPem)
  const valid = verifier.verify(publicKey, b64urlDecode(sigB64))
  if (!valid) {
    return { ok: false, reason: 'signature mismatch — license not issued by Mnemo' }
  }

  if (typeof payload.exp !== 'number') {
    return { ok: false, reason: 'missing exp claim' }
  }
  if (typeof payload.iat !== 'number') {
    return { ok: false, reason: 'missing iat claim' }
  }
  if (payload.iat > payload.exp) {
    return { ok: false, reason: 'malformed claims: iat after exp' }
  }
  // Reject tokens issued meaningfully in the future (clock-skew tolerant).
  // A license with iat > now + skew is either forged or signed by a host
  // with a badly-set RTC — either way, refuse it.
  if (payload.iat > now + clockSkewSeconds) {
    return { ok: false, reason: 'license iat is in the future' }
  }
  if (payload.exp + clockSkewSeconds < now) {
    const expired = new Date(payload.exp * 1000).toISOString()
    return { ok: false, reason: `license expired ${expired}` }
  }
  if (payload.tier !== 'enterprise' && payload.tier !== 'enterprise-air-gapped') {
    return { ok: false, reason: `unsupported tier: ${String(payload.tier)}` }
  }
  if (typeof payload.workspace_limit !== 'number' || payload.workspace_limit < 0) {
    return { ok: false, reason: 'invalid workspace_limit claim' }
  }

  return { ok: true, claims: payload }
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

// CLI entry-point
// Use pathToFileURL so that paths containing spaces or special characters
// (which import.meta.url percent-encodes) still match argv[1].
import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const key = process.argv[2] ?? process.env.GETMNEMO_LICENSE_KEY
  if (!key) {
    process.stderr.write('Usage: ts-node verify.ts <jwt>  (or set GETMNEMO_LICENSE_KEY)\n')
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
