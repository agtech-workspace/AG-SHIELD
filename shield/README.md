# Shield by AG Tech — the Truecaller for bank apps

Streamlined B2C risk scanner, sibling to `safeguard-web` (same parent project).
Strips away heavy admin config and focuses on fast utility-driven lookups.

## Features

- **Instant Scanner** — account number + bank dropdown → Safe / Review / Block
  verdict with risk tier, score, masked account name, and scan history.
- **Dynamic theme toggle** — Sun/Moon in the nav; persisted in `localStorage`.
- **Print Report** — native `@media print` + `window.print()` audit trail that
  strips the nav and theme toggle from the output.
- **TechVerse 2027 modal** — appears 2s after first visit, once per session;
  "Don't show again" persists via `localStorage`; includes a light waitlist
  form (name / email / role) stored locally.
- **Report a Scam** — ported from `safeguard-web` §4: account + bank, category
  chip grid, description counter, evidence (link / image / PDF drop zone),
  plus a "Your Reports" rail (status badges, masked account · bank · date).

## Running

```bash
npm install
npm run dev
```

Without a backend the scanner uses demo heuristics and reporting shows a
"not configured" notice. To enable live data:

1. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` to the AG SHIELD Supabase project values.
2. Live scans read `accounts` (RLS-off). Reporting uses the
   `submit_user_report` RPC + `evidence` storage bucket and requires a signed-in
   Supabase auth session (email/password, created inline).

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`

Dependency diet: only React, `@supabase/supabase-js`, Vite + TypeScript. All
icons and styling are hand-rolled (no Tailwind, no icon/UI packages).