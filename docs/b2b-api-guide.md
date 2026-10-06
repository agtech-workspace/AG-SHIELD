# AG SHIELD B2B API Integration Guide (Partner-Facing)

Hand this document to a partner's engineering team. The risk engine is a black box:
inputs (account + bank) and outputs (verdict, score, evidence) only — no algorithms,
no scoring matrix, no database internals, no secrets.

## Overview

The AG SHIELD API provides real-time risk assessment for Nigerian bank accounts.
Submit an account number and bank name; receive an automated safety verdict, a risk
score with confidence, recommended action, and any registry evidence.

## Authentication

All requests authenticate with an API key in the `X-API-Key` header.

```
X-API-Key: sk_live_...
```

- Keys are hashed at rest; the plaintext key is shown once at issuance — store it securely.
- Keys are scoped. The `risk-check` scope is required for the endpoint below; a valid key without it receives `403`.
- Keys have a default 90-day lifetime (`expires_at`) — rotate before expiry using the admin console (rotation issues a new key and invalidates the old one).
- Keys are bound to a tenant, a monthly call quota, and a per-IP rate limit.

## Base URL

```
https://zmiaaxnevvznmvfzlcba.functions.supabase.co
```

## Endpoint: Account Risk Scan

```
POST /risk-check
Content-Type: application/json
X-API-Key: <your key>
```

### Request Body

```json
{
  "account_number": "0123456789",
  "bank_name": "GTBank",
  "amount": 250000,
  "is_new_recipient": true,
  "holder_name": "JOHN DOE"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `account_number` | string | yes | 10-digit NUBAN. Invalid format → `400`. |
| `bank_name` | string | yes | Bank name (e.g. `GTBank`, `Access Bank`). |
| `amount` | number | no | Transfer amount in NGN; sharp-array heuristics use it. |
| `is_new_recipient` | boolean | no | First-time recipient flag; defaults to true for risk purposes. |
| `holder_name` | string | no | Expected account holder name; enables name screening against registries. |

### Successful Response (200 OK)

```json
{
  "risk_level": "warning",
  "risk_score": 62,
  "confidence_interval": [58, 67],
  "recommended_action": "REVIEW",
  "source_registry": "OSINT",
  "reasons": [
    "Reported for non-delivery of goods",
    "New recipient with high-value transfer"
  ],
  "social_proof": { "reports": 3, "first_reported": "2026-08-14" },
  "execution_time_ms": 142
}
```

| Field | Meaning |
|---|---|
| `risk_level` | `safe` \| `warning` \| `high_risk` |
| `risk_score` | 0–100 (higher = more dangerous) |
| `confidence_interval` | `[low, high]` bounds around the score given data coverage |
| `recommended_action` | `ALLOW` \| `REVIEW` \| `BLOCK` — implement this in your flow |
| `source_registry` | Authority tier of the strongest evidence (`OFFICIAL`/`OSINT`), or null when clean |
| `reasons[]` | Human-readable evidence strings (may be empty for clean accounts) |
| `social_proof` | Community report counts when OSINT evidence exists; null otherwise |
| `execution_time_ms` | Server-side latency for the call |

## Error Handling

| Status | Meaning | What to do |
|---|---|---|
| `400` | Malformed input (bad NUBAN, missing required fields, wrong JSON) | Fix the request body. |
| `401` | Missing or invalid API key | Check the `X-API-Key` header. |
| `403` | Valid key, but missing required scope (`risk-check`) or expired/revoked key | Request a scoped, active key. |
| `429` | Rate limit or quota exceeded (per-IP ~30 req/min + burst guard + monthly tenant quota) | Back off exponentially; check quota usage. |
| `500` | Unexpected server error | Retry with backoff; contact support if persistent. |
| `503` | Upstream/DB timeout — treat as *unknown*, not safe | Retry later; do not fail open on money movement. |

## Quotas & Limits

- **Rate limit:** ~30 requests/minute per IP plus a short-window burst guard.
- **Monthly quota:** per-tenant, shown at issuance and in the admin console (`v_tenant_monthly_usage`). Exceeded → `429` until the next quota period.
- **Evaluation tier:** new tenants start with 100 free evaluation calls (Official + Community registry tiers).

## Best Practices

- Treat `503` and `429` as **unknown** outcomes — never as `safe`.
- Honor `recommended_action`; `REVIEW` means queue for human review, not auto-approve.
- Cache nothing beyond the response's implied TTL: registry data changes continuously.
- Keep keys server-side only; never ship them in mobile/web clients.
- Rotate on staff changes and every ≤90 days.
