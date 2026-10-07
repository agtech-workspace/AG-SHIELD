# Shield Scanner + TechVerse — Source Spec (Phase D material)

> Relocated verbatim from `safeguard-web/future_feature_plans.txt` (source archive:
> `safeguard-web/future_feature_plans_source_material_archive.txt`). This is backlog
> Phase D source material — do not implement yet.

## 1. Sub-Product Specification: Shield Scanner

This is the internal blueprint for your streamlined B2C frontend. It strips away the heavy admin configurations and focuses purely on fast, utility-driven risk lookups.

### Product Identity

- **Name:** Shield Scanner
- **Tagline:** *Shield by AG Tech, the Truecaller for bank apps.*

### Core Features

- **The Instant Scanner:** A minimalist, single-page interface featuring two primary input fields (Account Number and Bank Dropdown) and a prominent "Scan" button. Results appear instantly below the fold, categorizing the account as Safe, Review, or Block, alongside the masked account name and risk tier.
- **Dynamic Theme Toggle:** A prominent icon (Sun/Moon) in the navigation bar allowing users to switch between Light Mode and Dark Mode. The theme preference should persist across sessions using local browser storage (`localStorage`).
- **Export & Print Audit Trail:** A "Print Report" button attached to the scan history section. This utilizes native CSS `@media print` and JavaScript `window.print()` to generate a clean, vector-sharp physical or PDF copy of their recent searches and risk ratings, removing UI clutter (like the navigation bar and theme toggle) from the final document.
- **Techverse 2027 Announcement Modal:** A lightweight promotional popup that triggers on the user's first visit to the scanner.
  - **Headline:** "Join us at Techverse 2027!"
  - **Content:** Brief details about the upcoming conference and its focus on cybersecurity and fintech infrastructure.
  - **Interaction:** Includes a primary Call-to-Action button ("Learn More" / "Register") and a secondary "Dismiss" button. The dismissal state is saved in cookies or local storage so it does not interrupt the user on subsequent visits.

### The TechVerse 2027 Announcement Modal

To ensure the popup promotes the event without disrupting the user's primary task (running bank scans), it should be lightweight, non-intrusive, and session-aware.

**Modal UX & Trigger Logic**

- **Trigger Rule:** Display 2 seconds after the page loads, but only once per session (use `sessionStorage.setItem('techverse_modal_seen', 'true')` so it doesn't re-appear on every page refresh).
- **Dismissal:** Include a prominent "X" close button in the top right, as well as a "Don't show again" option using localStorage.
- **Theme Integration:** Dynamically match your app's Light/Dark mode state.

**Recommended Modal Copy**

```
[ Badge: AG TECH PRESENTS ]

TechVerse Connect 2027
Empower. Build. Replicate.

Join Africa's premier 2-Day Immersive Residency bringing together global
tech leaders, founders, and campus innovators to build continent-scale
infrastructure.

📍 Location: University of Lagos (UNILAG), Nigeria
🗓️ Format: 2-Day Biannual Residency
💡 Tracks: Cybersecurity & Zero-Trust | AI Governance | Product & Venture Building

Featured Keynotes & Panels from leaders at AWS, Paystack, Interswitch,
EU Delegation, and the Ministry of Communications.

[ Button: Join Waitlist / Learn More ]    [ Link: Dismiss ]
```

## 2. The Site Event Panel (/events or Dashboard Section)

The Event Panel on your site serves as the full landing section for TechVerse Connect 2027, detailing the agenda, speaker tracks, and institutional partnerships.

### Section Breakdown & Copy

**Header / Hero Banner**

- Headline: TechVerse Connect 2027: Building Continent-Scale Tech Infrastructure
- Sub-headline: Connecting Campus Talent to National Impact.
- Location & Format: University of Lagos (UNILAG), Nigeria • 2-Day Immersive Residency

**2-Day Agenda Overview**

Day 1: Alignment & The Future of Infrastructure

- Opening Keynote: National Infrastructure & Sovereign Technology
- Panel 1.1 — Cyber Security, Zero-Trust & Cloud Defense: Protecting financial switches, public APIs, and cloud architecture from global cyber threats.
- Panel 1.2 — AI Governance, Machine Learning & Ethical Code: Local data pipelines, algorithmic auditing, and ML deployment in emerging markets.
- Panel 1.3 — Digital Public Infrastructure & Youth Talent Funnels: Aligning student developers with global development initiatives (EU-Nigeria Digital Economy, 3MTT, Finnish Talent Initiatives).

Day 2: Creativity, Product & Venture Building

- Keynote — Building Products for the Next 100 Million: Campus ideation to commercial scale.
- Panel 2.1 — The Multiverse of Product: Bridging engineering, UI/UX design, and intuitive human design.
- Panel 2.2 — Creative Tech, Gaming, Web3 & Immersive Media: 3D graphics, game engines, and gamified applications for the African economy.
- Panel 2.3 — Capital, Governance & Building for Longevity: Institutional funding and corporate governance for high-growth ventures.

**Sponsorship & Industry Pillars**

Showcase the key ecosystem categories supporting the residency:

- Cloud Infrastructure & AI: AWS, Microsoft Africa, Google Cloud
- Payments & Enterprise Fintech: Paystack, Flutterwave, Moniepoint
- Public Sector & Diplomatic: EU Delegation to Nigeria, HAUS Finland, ESTDEV Estonia
- Telecommunications: MTN Nigeria, Airtel Africa

**Call-to-Action (CTA) Panel**

Divide the action buttons by user type:

- For Students & Developers: [ Apply to Youth Talent Funnel ]
- For Enterprise & Sponsors: [ Request Sponsorship Pitchdeck ]
- For General Attendees: [ Reserve Campus Spot ]

### TechVerse 2027 Announcement Modal Copy

This modal pops up when a user visits the scanner or dashboard, designed to build instant authority and drive registration.

```
Header Badge: ANNUAL RESIDENCY • UNILAG 2027

Main Title: TechVerse Connect 2027: Empower. Build. Replicate.

Sub-Headline: Connecting Campus Talent to Continent-Scale Technology Infrastructure.

Body Content:
Join AG Tech Leadership, global founders, public sector leaders, and student
developers for a 2-day immersive residency at the University of Lagos. Explore
the future of sovereign tech, cloud defense, AI governance, and high-scale
product engineering.

Key Event Highlights:
Day 1 — Future of Infrastructure: Zero-Trust Cyber Security, AI Governance,
and Digital Public Infrastructure (DPI).
Day 2 — Product & Venture Building: Building for the Next 100M, Gaming,
Web3, and Institutional Venture Capital.
Global Ecosystem: Featuring keynotes, fireside chats, and panels with leaders
from top tech giants, public sector bodies, and venture firms.

Primary CTA Button: [ Reserve Campus Pass ]
Secondary CTA Button: [ View Full Blueprint ]
Dismiss Button: [ Maybe Later ]
```

## 3. On-Site Event Panel Widget Content

This panel lives permanently on your main site or scanner page to provide continuous event information and collect registrations.

**Card Header**

- Title: TechVerse Connect 2027
- Subtitle: 2-Day Immersive Residency at UNILAG, Nigeria
- Hosted By: AG Tech Leadership

**Featured Tracks & Agenda Breakdown**

- **Track 1: Cyber Security & Cloud Defense**
  - Focus: Protecting financial switches, public APIs, and zero-trust cloud architectures from global cyber threats.
  - Key Themes: Algorithmic auditing, local data pipelines, and ethical code deployment.
- **Track 2: Digital Public Infrastructure & Youth Talent**
  - Focus: Aligning student developers with global initiatives (EU-Nigeria Digital Economy, 3MTT, and Finnish Talent Pipelines).
  - Key Themes: Converting campus innovation into public sector utility.
- **Track 3: Product Engineering & Creative Tech**
  - Focus: Bridging intuitive UI/UX with code, 3D graphics, game engines, and Web3 rails built for the next 100 million users.
- **Track 4: Venture Capital & Longevity**
  - Focus: Institutional funding, corporate governance, and building sustainable tech ventures that outlast market cycles.

**Ecosystem & Partner Marquee (Footer Badge List)**

Display these partner badges/names at the bottom of the event panel to establish trust:

- Cloud & AI: AWS, Microsoft Africa, Google Cloud Platform
- Fintech & Enterprise: Paystack, Flutterwave, Moniepoint
- Public Sector & Diplomatic: EU Delegation to Nigeria, HAUS Finland, ESTDEV Estonia

**Event Panel Registration Form Fields**

- Field 1: Full Name
- Field 2: Email Address
- Field 3: Role Select (Student / Developer, Founder / Executive, Investor, Cybersecurity Analyst)
- Submit Action: [ Join TechVerse 2027 Waitlist ]

## 4. Reports UI — Plan (ported from safeguard-web)

Safeguard-web shipped the Reports tab redesign on 2026-10-07 (see
`future_feature_plans.txt` Phase E). This is the portable blueprint for the
Shield Scanner's own Reports / "Report a Scam" surface. It must stay
dependency-light: plain Tailwind + lucide-react only, no new packages.

**Why the old version looked bad**
- A single bare white card with unstyled `<input>`/`<select>`/`<textarea>`, a
  flat button, and one-colour feedback text; no hierarchy, no icons, no
  categories, and no list of the user's own reports (the Settings
  "View my reports" link was a dead end).

**Layout** — two-column grid on desktop (`lg:grid-cols-[1fr_340px]`), stacked
on mobile; `max-w-5xl`.

**Left — "Report a Scam" hero card** (keep a `data-tour` anchor for onboarding)
1. Header band with icon badge + title/subtitle.
2. **Step 1 · Account**: account number + bank side-by-side, icon-prefixed,
   monospace, auto-spaced `000 000 0000`; live preview chip under the inputs
   (spaced account · bank · NIP code).
3. **Step 2 · Scam category**: replace the dropdown with a selectable chip
   grid, one lucide icon + accent colour per category (map local to the
   `REPORT_CATEGORIES` list; "Other" reveals an inline text field). Selected
   state = tinted chip + ring + trailing check.
4. **Step 3 · What happened**: `maxLength={400}` textarea with a live
   `n/400` counter.
5. **Step 4 · Evidence**: pill segmented control (Link / Image / PDF). Link =
   URL input; Image/PDF = dashed drag-and-drop zone (hidden file input,
   file-name/size chip, remove button, uploading spinner).
6. Full-width submit with icon; feedback is a green/red alert banner
   (CheckCircle / AlertCircle), not bare text.
7. **Success state**: replace the form body with a confirmation panel
   (check icon, masked account, "Submit another" / "View my reports" buttons).

**Right rail**
- **Your Reports**: rows for `reports` where `reporter_id = me` (RLS SELECT
  is world-readable for authenticated users), masked account · bank · date,
  status badge (approved green / pending amber / rejected red), category
  chip; empty state with a CTA; refetch after a successful submit.
- **"How reports are used"**: 3 icon bullets (moderator review, risk-score
  signal, warn users who search the account).

**Scanner-specific notes**
- The same `submit_user_report` RPC + `evidence` storage bucket are reused.
- In the scanner the tab may be a link from the scan result footer instead of
  a top-level tab; keep the identical card/rail layout regardless.
- Verification gate: `tsc` 0, eslint 0, vitest suite green, `npm run build`.
