# @ag-tech/shield-sdk (unpublished preview)

Server-side Node.js 22+ TypeScript integration with the existing `POST /risk-check` endpoint. Never put API keys in the browser.

```ts
import { AGShieldClient, AGShieldError } from '@ag-tech/shield-sdk'
const client = new AGShieldClient({ apiKey: process.env.AG_SHIELD_API_KEY! })
try {
  const assessment = await client.riskCheck({ account_number: '0123456789', bank_name: 'GTBank' })
  if (assessment.recommended_action === 'REVIEW') { /* queue for manual review */ }
} catch (error) {
  // Decision UNKNOWN. Block/hold until a trustworthy assessment is available.
  if (error instanceof AGShieldError) console.error(error.message)
}
```

`npm test` builds and runs contract checks. No automatic retry by default (the API meters calls). This package is not published or production-certified.
