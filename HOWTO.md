# How To Use — Burrows Dashboard

This guide covers how to set up, run, and operate the Burrows Dashboard project — the web application built on top of the `burrows-db-sync` data layer.

> **Standing rule for this project:** every time something new is added (a feature, a script, a config file, an environment variable), this guide gets updated to describe it.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Running the Project Locally](#3-running-the-project-locally)
4. [Authentication](#4-authentication)
5. [Environment Variables](#5-environment-variables)
6. [Adding New Pages / Tools](#6-adding-new-pages--tools)
7. [UI Design System — Tailwind CSS + shadcn/ui](#7-ui-design-system--tailwind-css--shadcnui)
8. [Store Performance Dashboard — How the Widgets Work](#8-store-performance-dashboard--how-the-widgets-work)
9. [Pandora Functions — Phase 2 (Standalone Reference Database)](#9-pandora-functions--phase-2-standalone-reference-database)
10. [Build & Deployment Workflow](#10-build--deployment-workflow)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Project Overview

The Burrows Dashboard is a web application that sits on top of the `burrows_jewellers` PostgreSQL database (populated daily by the `burrows-db-sync` project). It is the **single, central interface** for staff to interact with the data — financial tools, inventory tools, ordering tools, etc. all live inside this one app.

It consists of two parts:
- **`backend/`** — a Node.js/Express REST API that talks to PostgreSQL and exposes data to the frontend (with authentication)
- **`frontend/`** — a React (Vite) single-page application — the actual dashboard UI

**Current status:**
- ✅ **Phase 0 — Foundations:** Backend API with JWT-based admin login + working DB connection; frontend shell with login, protected routes, and sidebar navigation.
- ✅ **UI migration — Tailwind CSS + shadcn/ui:** The whole frontend was restyled onto a Tailwind v4 + shadcn/ui design system (Radix-based component primitives, CVA variants, CSS-variable theming with a signature green `--primary`). See [§7 UI Design System](#7-ui-design-system--tailwind-css--shadcnui) for how it's structured and how to build new pages with it.
- ✅ **Phase 1 — Store Performance Dashboard (partial):** The homepage now shows two **live** widgets:
  - **Today's Sales by Store** — transaction count and total tendered (collected) sales per store for the current date
  - **Highest Supplier Cost (Stock on Hand)** — total inventory cost value (cost price × quantity on hand) ranked by vendor
- ✅ **Phase 2 — Pandora Functions (standalone master list + reorder comparison + discontinue-marking):** A brand-new **"Pandora Functions"** page (built and shipped as **"Pandora Reference"**, renamed to **"Pandora Ordering"** once its reorder/CSV-export feature became the headline, then renamed again to **"Pandora Functions"** as the single home for *every* Pandora tool — see the redesign/rename notes in [§9](#9-pandora-functions--phase-2-standalone-reference-database)) and a fully separate `pandora_reference` database now hold Pandora's build-to-level + discontinued-status master list, refreshed from a supplier CSV (one file covers both — see §9 for the full breakdown of why this merged what were originally going to be two separate phases). Staff can refresh the list at any time, **and** mark designs discontinued from a simple Design-Number list (auto-adding any design not already on file, purely for record-keeping) — both via one combined **"Update list"** control with Update / Mark Discontinued tabs; both upsert intelligently (only changed rows are touched). The page's headline feature is the **Reorder List** — comparing the master list's build-to-levels against actual on-hand stock to show exactly what to order today, with a department filter and one-click CSV export — and the summary cards double as quick filters into a simple master-list view.
- ⏳ **Phase 3 (pending):** A third homepage widget — *current Pandora stock cost* — will be added now that the Pandora reference data (build-to-levels / discontinued list) has been imported in Phase 2.

**Planned tools (placeholders currently in the nav, to be built in later phases):**
- **Store Performance Dashboard** (homepage) — ✅ partially live (see above); Pandora stock-cost widget pending (Phase 3)
- **Showcase Debt Reduction** — tracks debt paydown using Xero + sales/cost data
- **Pandora Functions** — ✅ live (Phase 2; shipped as "Pandora Reference", renamed to "Pandora Ordering" once its reorder-comparison + CSV-export feature became the headline, then renamed again to "Pandora Functions" to centralise *every* Pandora tool — including discontinue-marking — in one tab. The separate "Pandora Ordering" *and* "Pandora Discontinued" placeholders that used to sit alongside it have both been removed) — see [§9](#9-pandora-functions--phase-2-standalone-reference-database)

---

## 2. Project Structure

```
burrows-dashboard/
├── backend/
│   ├── index.js              # Express app entry point
│   ├── db/
│   │   ├── pool.js           # PostgreSQL connection pool (burrows_jewellers — read-only mirror)
│   │   └── pandoraPool.js    # SEPARATE connection pool (pandora_reference — app-owned, no FK/joins to burrows_jewellers)
│   ├── middleware/
│   │   └── auth.js           # JWT verification middleware (requireAuth)
│   ├── routes/
│   │   ├── auth.js           # POST /api/auth/login
│   │   ├── health.js         # GET  /api/health  (DB connectivity check)
│   │   ├── dashboard.js      # GET  /api/dashboard/today-sales, /top-suppliers
│   │   └── pandora.js        # Pandora Functions: POST /import, POST /discontinue, GET /imports, /summary, /items, /reorder, /reorder/export (see §9)
│   ├── .env                  # Local secrets/config (NOT committed)
│   ├── .env.example          # Template for .env
│   └── .gitignore
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js     # Shared Axios client (auto-attaches JWT, handles 401s)
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Auth state, login/logout, persists JWT
│   │   ├── lib/
│   │   │   └── utils.js      # cn() helper (clsx + tailwind-merge) — used by all UI primitives
│   │   ├── components/
│   │   │   ├── Layout.jsx    # Sidebar + nav shell for authenticated pages (Tailwind + lucide icons)
│   │   │   ├── ProtectedRoute.jsx # Redirects to /login if not authenticated
│   │   │   └── ui/           # shadcn/ui-style primitives (Radix + Tailwind + CVA variants)
│   │   │       ├── avatar.jsx
│   │   │       ├── badge.jsx
│   │   │       ├── button.jsx
│   │   │       ├── card.jsx
│   │   │       ├── input.jsx
│   │   │       ├── label.jsx
│   │   │       ├── separator.jsx
│   │   │       └── tabs.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx             # Tailwind/shadcn login card
│   │   │   ├── StorePerformance.jsx  # Homepage — live widgets (today's sales, top suppliers)
│   │   │   ├── PandoraFunctions.jsx  # Pandora Functions (renamed from PandoraReference.jsx → PandoraOrdering.jsx → here) — summary cards, master-list panel, reorder comparison + CSV export, update/discontinue tools (see §9)
│   │   │   └── Placeholder.jsx       # Generic "coming soon" page for unbuilt tools
│   │   ├── App.jsx           # Route definitions
│   │   ├── index.css         # Tailwind v4 entry point + shadcn theme (CSS variables, @theme)
│   │   └── main.jsx          # App bootstrap
│   ├── postcss.config.js     # @tailwindcss/postcss plugin (Tailwind v4)
│   ├── jsconfig.json         # Editor path resolution for the `@/*` → `src/*` alias
│   ├── .env                  # Local frontend config (NOT committed)
│   ├── .env.example
│   └── .gitignore
│
└── HOWTO.md                  # This file
```

---

## 3. Running the Project Locally

> **Local-first workflow:** all new features for this project are built and tested locally first. Only once everything works locally do we deploy to the Digital Oceandroplet (the same server running `burrows-db-sync`).

### Step 1 — Start the backend
```bash
cd burrows-dashboard/backend
npm install        # first time only
node index.js
```
The API runs at `http://localhost:4000`. You should see:
```
Burrows Dashboard API listening on port 4000
```

### Step 2 — Start the frontend
```bash
cd burrows-dashboard/frontend
npm install        # first time only
npm run dev
```
The app runs at `http://localhost:5173`. Open that URL in your browser.

### Step 3 — Log in
Use the admin credentials configured in `backend/.env` (see [Authentication](#4-authentication) below).

### Quick health check (no login required)
```bash
curl http://localhost:4000/api/health
```
Returns `{"status":"ok", ...}` if the API is up and can reach the database.

---

## 4. Authentication

Phase 0 uses a **simple single-admin login** (matches the current need — one user, accessed from anywhere):

- The backend stores one admin username and a **bcrypt-hashed** password in environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`) — never a plaintext password.
- `POST /api/auth/login` checks the credentials and returns a signed **JWT** (JSON Web Token).
- The frontend stores that token in `localStorage` and sends it as `Authorization: Bearer <token>` on every API request (handled automatically by `frontend/src/api/client.js`).
- All protected backend routes use the `requireAuth` middleware (`backend/middleware/auth.js`), which verifies the token before allowing the request through.
- If a token is missing/expired/invalid, the API returns `401`, and the frontend automatically logs the user out and redirects to `/login`.

### Default local credentials
```
Username: admin
Password: BurrowsAdmin2026!
```
**You should change this password.** To generate a new bcrypt hash for a new password, run this from `backend/`:
```bash
node -e "console.log(require('bcrypt').hashSync('YOUR_NEW_PASSWORD', 10))"
```
Then paste the resulting hash into `ADMIN_PASSWORD_HASH` in `backend/.env` (replacing the old one), and restart the backend.

---

## 5. Environment Variables

### `backend/.env`
| Variable | Purpose |
|---|---|
| `PORT` | Port the API listens on (default `4000`) |
| `JWT_SECRET` | Secret key used to sign/verify login tokens — keep this private |
| `JWT_EXPIRES_IN` | How long a login session lasts (default `12h`) |
| `ADMIN_USERNAME` | The admin login username |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of the admin password (see above for how to generate) |
| `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGDATABASE` | Connection details for the `burrows_jewellers` PostgreSQL database (same DB as `burrows-db-sync`) |
| `PANDORA_PGUSER`, `PANDORA_PGPASSWORD`, `PANDORA_PGHOST`, `PANDORA_PGPORT`, `PANDORA_PGDATABASE` | Connection details for the **separate** `pandora_reference` database (see [§9](#9-pandora-functions--phase-2-standalone-reference-database)) — deliberately a distinct pool/connection from the main `PG*` vars so the two databases stay logically isolated, even though they currently live on the same local Postgres instance |
| `FRONTEND_ORIGIN` | The frontend's URL, used to configure CORS |

### `frontend/.env`
| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL the frontend uses to reach the backend API |

Both `.env` files are excluded from git via `.gitignore` — copy from the matching `.env.example` to set up a new environment.

---

## 6. Adding New Pages / Tools

The app is structured so new tools slot in cleanly:

**Backend** — add a new route module:
1. Create `backend/routes/<feature>.js` (model it on `routes/dashboard.js`)
2. Protect it with `const { requireAuth } = require('../middleware/auth');`
3. Register it in `backend/index.js`: `app.use('/api/<feature>', require('./routes/<feature>'));`

**Frontend** — add a new page:
1. Create `frontend/src/pages/<Feature>.jsx`
2. Add a `<Route path="<feature>" element={<Feature />} />` inside the protected `<Route>` block in `App.jsx`
3. Add a nav entry to the `navItems` array in `components/Layout.jsx`

This keeps every tool self-contained while sharing the same login, layout, and API client.

---

## 7. UI Design System — Tailwind CSS + shadcn/ui

The frontend's visual style was migrated from hand-written CSS files to a **Tailwind CSS v4 + shadcn/ui** design system (component primitives wrapping Radix UI, styled with Tailwind utility classes and `class-variance-authority` variants). Every page now uses these shared building blocks instead of bespoke `.css` files — this keeps the look consistent as new tools are added and makes restyling the whole app a matter of changing a handful of CSS variables.

### Stack
- **Tailwind CSS v4.3.0** + `@tailwindcss/postcss` (PostCSS plugin) + `autoprefixer` — note v4 uses CSS-based `@theme`/`@import "tailwindcss"` configuration, **not** the v3-style `tailwind.config.js` content-path setup
- **`clsx` + `tailwind-merge`** — combined into the `cn()` helper (`src/lib/utils.js`) used by every styled component to merge conditional/conflicting class names
- **`class-variance-authority` (CVA)** — defines style "variants" (e.g. button `variant="default" | "outline" | "ghost"`, sizes, badge colors)
- **`@radix-ui/react-*`** — unstyled, accessible primitives (dialog, dropdown-menu, select, tabs, toast, tooltip, popover, avatar, alert-dialog, label, separator, slot, …) that the `components/ui/*` wrappers style with Tailwind
- **`lucide-react`** — icon set used throughout the nav, cards, and buttons (sized `size-4`/`size-5`, i.e. `w-4 h-4` / `w-5 h-5`)
- **`recharts`** — installed for future chart widgets (not yet used)

### Theme — how the colors work
`src/index.css` is the single source of truth for the look:
1. `:root` and `.dark` define raw HSL triplets as CSS variables (`--background`, `--foreground`, `--card`, `--primary`, `--border`, `--radius`, etc.)
2. `@theme inline` maps those variables into Tailwind color tokens (`--color-primary: hsl(var(--primary))`, …) plus the border-radius scale and the accordion open/close keyframes used by Radix accordions
3. Components then just use ordinary Tailwind classes — `bg-primary`, `text-muted-foreground`, `border-border`, `rounded-lg`, etc. — and the actual rendered color comes from whichever theme is active

**To re-theme the whole app:** change the HSL values in `:root`/`.dark` in `src/index.css`. The signature brand color is `--primary: 142.1 76.2% 36.3%` (a fresh green); everything (buttons, active nav links, focus rings, the badge "Top" tag, etc.) derives from it.

### UI primitives (`src/components/ui/`)
Small, composable, Radix-backed components — currently: `avatar`, `badge`, `button`, `card` (+ `CardHeader/Title/Description/Content/Footer`), `input`, `label`, `separator`, `tabs`. Each wraps a Radix primitive (where one exists) with Tailwind classes and, where it has multiple looks, a CVA `variants` config. Add new primitives the same way — copy the pattern from an existing file, wrap the matching `@radix-ui/react-*` package, and expose variants via `cva()`.

### Conventions used across pages
- **Cards everywhere** — every widget/section is a `<Card>` with `<CardHeader>`/`<CardContent>`; padding follows the default `p-6`/`pt-0` scale
- **Badges** for status/labels — e.g. the "Top" tag on the highest-cost supplier uses `<Badge variant="success">`
- **Icons** from `lucide-react`, sized `size-4` (nav items, table icons) up to `size-5`/`size-6` (header accents, empty states); wrapped in a small rounded "chip" (`flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary`) for card headers
- **Sidebar nav** — active link gets `bg-primary text-primary-foreground`, inactive gets `text-muted-foreground hover:bg-accent`
- **Tables** inside cards use `rounded-lg border` wrappers, `bg-muted/60` header rows, `divide-y` body rows, and `tabular-nums` for numeric columns so figures align
- **Spacing/text scale** — `gap-2`/`gap-3`/`gap-6` for layout spacing, `text-xs`/`text-sm` for secondary text, `text-2xl font-semibold tracking-tight` for page titles

### Adding a styled page
1. Build the page from `<Card>`/`<CardHeader>`/`<CardContent>` and the other primitives in `components/ui/`
2. Use Tailwind utility classes for layout (`flex`, `grid`, `gap-*`, `rounded-*`) and theme tokens for color (`bg-card`, `text-muted-foreground`, `border-border`) rather than hard-coded colors — this keeps it consistent with the theme and dark-mode-ready
3. Pull icons from `lucide-react` rather than emoji or image assets
4. If you need a new look that doesn't exist yet (e.g. a dialog, dropdown, or toast), add a new primitive to `components/ui/` first, following the existing pattern

---

## 8. Store Performance Dashboard — How the Widgets Work

The homepage (`frontend/src/pages/StorePerformance.jsx`) is a grid of "widget cards," each backed by its own endpoint in `backend/routes/dashboard.js`. All queries are **read-only** against the synced mirror tables (never written to).

### Today's Sales by Store
- **Endpoint:** `GET /api/dashboard/today-sales`
- **What it shows:** transaction count + total sales for the current date, for every store (including ones with $0 today, or ones that don't sync through EdgePulse — e.g. Mildura Showcase Jewellers and the Warehouse currently show no EdgePulse sales activity).
- **How "total sales" is calculated:** sums `EP_SaleLines` rows where `slKey1 = 'TENDER'` (i.e. amounts actually tendered/collected — cash, card, gift cards, layaway payments, etc.), excluding voided sales. This mirrors what the figures look like in EdgePulse itself, rather than raw invoiced line totals (we found these can differ — see the troubleshooting notes in `burrows-db-sync`'s history for why).
- **Note on "today":** this uses the database server's `CURRENT_DATE`. Locally, your data will only be as fresh as your last local sync — the **live, current** numbers appear once this runs against the production database on the server (synced nightly at 2 AM).

### Highest Supplier Cost (Stock on Hand)
- **Endpoint:** `GET /api/dashboard/top-suppliers?limit=8`
- **What it shows:** for each vendor, the total cost-price value of inventory currently on hand (`Items.Cost × ItemQOH.AvailQOH`, summed across all stores), ranked highest first. This answers "which supplier do we have the most money tied up in stock with."
- Useful early finding: **Pandora Jewellery (`VendorID = 'PANDO'`)** is currently the largest single cost exposure — ~$232K tied up in ~5,500 units. (Note: this is the *vendor*-based view; the dedicated Pandora stock-cost widget planned for Phase 3 will use the more reliable Design-Number-based matching against the Pandora reference list, since not all Pandora stock is necessarily filed under that vendor.)

### Adding more widgets
Follow the same pattern: add a query function to `routes/dashboard.js` (or a new route file for a different page), then add a corresponding card component to the page. Keep each widget's loading/error state independent so one slow query doesn't block the others.

---

## 9. Pandora Functions — Phase 2 (Standalone Reference Database)

**Phase 2** added a brand-new tool, now named **Pandora Functions** (`/pandora-functions` in the nav, `frontend/src/pages/PandoraFunctions.jsx`) — the single centralised home for every Pandora-related task staff need. It manages Pandora's "build to level" / discontinued-status master list (refreshed from a CSV the supplier periodically provides, or maintained by marking designs discontinued directly), and — its headline feature — compares that master list against our actual on-hand inventory to tell staff exactly what to order today, with a one-click CSV export.

> **Redesign note:** Phase 2 originally shipped under the name **"Pandora Reference"** with a prominent "Import Master List" card and a search/filter/browse table as the main content. After using it, the project owner asked for a redesign (documented here as the first shipped redesign): the master list isn't something you "import" fresh each time — it's a living document staff *update* — so that capability moved to a small secondary control, the search/filter browse UI was removed in favour of making the summary cards themselves the browse entry points, and the main content became the **Reorder List**, a brand-new comparison feature against real inventory.
>
> **First rename note:** Once the Reorder List + CSV export became the page's headline feature, the project owner pointed out that a separate **"Pandora Ordering"** placeholder page already sat in the nav (planned as a future phase to do exactly this kind of reorder-suggestion work) — and asked to remove that placeholder and rename this page from "Pandora Reference" to "Pandora Ordering" instead, since it now *is* the ordering tool. So: the file was renamed `PandoraReference.jsx` → `PandoraOrdering.jsx`, the component `PandoraReference` → `PandoraOrdering`, the route `/pandora-reference` → `/pandora-ordering`, the on-page heading and nav label both now read "Pandora Ordering", and the old placeholder `<Route path="pandora-ordering" element={<Placeholder ... />} />` / nav entry was deleted outright.
>
> **Second rename + centralisation note:** With the reorder/generate-order capability shipped, the project owner asked to go further: *"centralize all pandora functions in 1 tab. Rename Pandora Ordering to Pandora Functions"* — and clarified that the still-outstanding **"Pandora Discontinue"** idea wasn't already covered by the "Discontinued" status filter (an assumption this guide briefly stated incorrectly); it's a distinct, not-yet-built **feature** for actively marking current master-list products as discontinued. So in one pass: the page was renamed *again* — file `PandoraOrdering.jsx` → `PandoraFunctions.jsx`, component `PandoraOrdering` → `PandoraFunctions`, route `/pandora-ordering` → `/pandora-functions`, heading/nav label → "Pandora Functions" — **and** the separate **"Pandora Discontinued"** placeholder page/route/nav entry (`/pandora-discontinued`, `PackageX` icon) was deleted outright, with its purpose folded into a brand-new **Mark Discontinued** feature built directly into this page's "Update list" control (see below). The underlying `pandora_reference` **database** keeps its original name throughout all of this — only the page/route/component were ever renamed, never the data store.

### Why this merged two originally-separate phases into one
The original roadmap had **Pandora Reference DB** (build-to-levels) and **Pandora Discontinued Products** as two separate future phases. Once we looked at the actual source file Pandora provides — `20251124_Pandora_OrderTemplate_ver4.csv`, with columns `Design#, Department, Description, Minimum Quantity, Status` — it became clear **both pieces of data live in the same CSV** ("Minimum Quantity" is the build-to-level, and a `Status` of `Discontinued` flags a design as discontinued). So rather than build two separate import pipelines and two separate pages, Phase 2 became **one CSV-driven master list** that both serves as the build-to-level reference *and* lets staff filter to "Discontinued" designs as a view of the same data — *and*, per the centralisation note above, also gained an active **Mark Discontinued** tool so staff aren't limited to whatever status Pandora's own CSV happens to report. The standalone "Pandora Discontinued Products" placeholder in the nav is retired by all of this — every Pandora-related capability now lives on the Pandora Functions page.

### Critical design constraint — a logically separate database
Per direction from the project owner: *"This database is not connected to the database that we have — this is mainly to have a reference of the build to level of Pandora items."* The Pandora reference data therefore lives in **its own PostgreSQL database, `pandora_reference`**, completely separate from `burrows_jewellers`:
- **No foreign keys, no joins, no cross-database queries** between the two databases — they're connected to via two entirely separate connection pools (`backend/db/pool.js` for `burrows_jewellers`, `backend/db/pandoraPool.js` for `pandora_reference`)
- `burrows_jewellers` remains a **read-only mirror** synced by `burrows-db-sync`; `pandora_reference` is **fully app-owned** (the dashboard backend has full read/write control and is the source of truth for it)
- They happen to run on the same local Postgres instance for practicality during local development — "same server, different database" satisfies "not connected" while keeping local setup simple. (If this ever needs to change for production, that's a connection-string change only — the application code already treats them as fully independent.)
- Matching Pandora reference data against our actual inventory — used by the **Reorder List** feature below — happens **in application code**, by looking up Design Numbers across both result sets — never via SQL joins across the databases. The matching key is `pandora_items.design_num` ↔ `Items.realdesignnum` (NOT `Items.designnum`, which is missing the dash Pandora's format uses — e.g. `"549588C002"` vs the master list's `"549588C00-2"`)

### Database schema (`pandora_reference`)
```sql
CREATE TABLE pandora_items (
  design_num      TEXT PRIMARY KEY,
  department      TEXT,
  description     TEXT,
  build_to_level  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discontinued')),
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- indexes on department and status for fast filtering

CREATE TABLE pandora_imports (
  id SERIAL PRIMARY KEY,
  filename TEXT,
  rows_total INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_unchanged INTEGER DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT now(),
  kind TEXT NOT NULL DEFAULT 'update' CHECK (kind IN ('update', 'discontinue'))
);
```
- `pandora_items` — one row per Pandora design number; this is the master list staff browse/search
- `pandora_imports` — a log of every CSV import *or* discontinue-upload (filename, row counts, timestamp, and now `kind`) so staff can see when the list was last refreshed and when designs were last marked discontinued, as two separate histories

> The database was created locally with a small inline Node `pg` script (no `psql` was available in PATH on this machine) — see the project's git history / session notes if you need to recreate it elsewhere. The DDL above is the full schema (including the `kind` column added when the Mark Discontinued feature shipped — applied locally via `ALTER TABLE pandora_imports ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'update'` plus a `CHECK (kind IN ('update','discontinue'))` constraint, so existing rows transparently became `kind = 'update'`); running the DDL above against a fresh `pandora_reference` database is sufficient to set it up from scratch.

### Backend — `backend/routes/pandora.js`
All endpoints are mounted at `/api/pandora` and protected by `requireAuth`. The file imports **two** pools — `pandoraPool` (for `pandora_reference`, the source of truth for the master list) and `burrowsPool` (the existing `db/pool.js` for `burrows_jewellers`, used **read-only** purely to look up actual on-hand stock for comparison — never joined in SQL, see the standalone-DB constraint above):

- **`POST /import`** — accepts a CSV file upload (`multipart/form-data`, field name `file`, handled by `multer` with in-memory storage, 10 MB limit). Parses it with `csv-parse/sync`, then **upserts** every row inside a transaction using a single `INSERT ... ON CONFLICT (design_num) DO UPDATE ... WHERE <fields> IS DISTINCT FROM ... RETURNING (xmax = 0) AS inserted` statement — this elegantly tells us in one round-trip whether each row was a fresh **insert** (`inserted = true`), a real **update** (row returned, `inserted = false`), or **unchanged** (no row returned, because the `WHERE` clause found nothing actually differed). A summary (`rowsTotal/rowsInserted/rowsUpdated/rowsUnchanged`) is recorded in `pandora_imports` (with `kind = 'update'`) and returned to the frontend. Column matching is tolerant of minor header variations (`pickColumn()` handles BOM characters, "Design#" vs "Design #", case differences, etc.). This is how staff **update** the list when Pandora releases new designs or changes levels/status — it's a living document, not a one-time import, so upserting by Design Number means refreshing is always safe to run (unchanged rows are left untouched)
- **`POST /discontinue`** — the **Mark Discontinued** feature. Accepts a CSV upload (same `multipart/form-data` shape as `/import`, also via `multer`) containing a deliberately *simple* list of Design Numbers — the project owner specifically chose **"just Design Numbers (one per row, or a Design# column)"** over reusing the full master-list CSV format, since that's all staff realistically have on hand when Pandora tells them a batch of designs is being discontinued. Parsing is handled by a dedicated `parseDesignNumberList()` helper (see below) rather than `normalizeRow()`, because a headerless one-per-row file would otherwise have its first design number swallowed as a CSV header by `csv-parse`'s `columns: true` mode. For every design number found, a `DISCONTINUE_UPSERT_SQL` statement runs inside a transaction:
  - If the design **already exists** in `pandora_items`, only its `status` (→ `'discontinued'`) and `updated_at` change — its `department`/`description`/`build_to_level` are left exactly as they were (the `WHERE pandora_items.status IS DISTINCT FROM 'discontinued'` clause means already-discontinued designs are correctly reported as **unchanged**, not re-updated)
  - If the design **doesn't exist yet**, it's **inserted** as a new discontinued record with `build_to_level = 0` and `status = 'discontinued'` (plus `department`/`description` from the file if it happened to provide them, `NULL` otherwise) — this was an explicit ask from the project owner: *"if the uploaded list has a design number not matching any products in the master list it should add this design number and mark discontinue... it's still good to have data of products"* — i.e. we keep a historical record of every design Pandora has ever discontinued, even ones we never stocked, without it ever showing up in the Reorder List (which only looks at `status = 'active'`)
  
  Just like `/import`, the same `RETURNING (xmax = 0) AS inserted` trick classifies each row as inserted / updated / unchanged in one round-trip. A summary is recorded in `pandora_imports` with **`kind = 'discontinue'`** (so its history is tracked completely separately from CSV refreshes) and returned to the frontend
- **`GET /imports?limit=10&kind=update|discontinue`** — recent import/discontinue-upload history, used by the "Update list" control's two tabs to each show their own "Last updated: … on …" / "Last run: … on …" line. The new optional `kind` filter (added alongside the Mark Discontinued feature) lets each tab query only its own history; omit it to see both interleaved
- **`GET /summary`** — quick counts for the stat cards: total designs, active/discontinued counts, total build-to-level units summed, a department breakdown, and the most recent import
- **`GET /items?search=&department=&status=&page=&pageSize=`** — paginated, filterable browse of the master list (still used internally by the Master List panel opened from the summary cards — see below; `search` matches against both Design Number and Description, case-insensitive `ILIKE`)
- **`GET /reorder?department=&page=&pageSize=`** — the headline feature. Returns a paginated **"what to order today"** comparison: every *active* master-list design whose actual on-hand stock is below its Pandora build-to-level, with the quantity needed to top back up. See `getReorderComparison()` below for exactly how the comparison works. Response includes `totalReorderQty` (sum of every matching design's reorder quantity, across all pages, for the on-screen summary line)
- **`GET /reorder/export?department=`** — generates a supplier-ready order CSV covering **every** matching design (not just the current page), honouring the same `department` filter as the on-screen list. Columns, in order: **`Item, Description, Quantity, Cost`** (`Item` = design number, `Quantity` = the reorder quantity from the comparison, `Cost` = the design's average per-unit cost when available, blank otherwise). Served with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="pandora-reorder-YYYY-MM-DD.csv"`. Fields are escaped via a small `csvField()` helper (quotes around any value containing a comma, quote, or newline; embedded quotes doubled)

#### `parseDesignNumberList(buffer)` — tolerant parsing for the simple discontinue-list format
Used only by `POST /discontinue`. Unlike `normalizeRow()` (which assumes the full master-list CSV always has headers), this helper has to cope with the deliberately loose "just Design Numbers" format the project owner asked for, which might be:
- a **headerless** plain list — one design number per line, nothing else
- a CSV **with a header row** — a `Design#` (or `Design #` / `DesignNum` / `Design Number` / `Design`) column, optionally alongside `Department` / `Description` columns

It can't simply call `parse(buffer, { columns: true })` like `/import` does, because that mode treats row 0 as the header unconditionally — on a headerless file, the very first design number would be silently swallowed as a column name and lost. Instead it parses as raw rows (`columns: false`) and inspects row 0 itself: if its first cell matches one of the recognised "Design#"-style labels, or the row contains words like "department"/"description"/"status", it's treated as a header (and the matching column indexes are located); otherwise every row's first cell is treated directly as a design number. Department/Description are picked up from their columns when present, `null` otherwise. Rows with an empty design number are filtered out.

#### `getReorderComparison({ department })` — the cross-database matching logic
This is where the standalone-database constraint really matters — it's a textbook example of "matching in application code, never via SQL join":
1. Query `pandora_reference` for active master-list designs with `build_to_level > 0` (optionally filtered by department), sorted by department then design number
2. Collect their Design Numbers and query `burrows_jewellers` **separately** — `SELECT realdesignnum, SUM(totalavailqoh), ROUND(AVG(cost), 2) FROM Items WHERE vendorid = 'PANDO' AND realdesignnum = ANY($1::text[]) GROUP BY realdesignnum`. The `SUM`/`GROUP BY` is needed because a handful of design numbers map to multiple SKU rows (variants) — summing `totalavailqoh` (itself already a precomputed total-across-all-stores column on `Items`) gives the true total on-hand for that design, and averaging cost gives a sensible representative unit cost
3. Build a `Map` from the inventory result and walk the master list, computing `reorderQty = Math.max(buildToLevel - onHand, 0)` for each design, then **filter to only designs where `reorderQty > 0`** — i.e. designs that are at or above their build-to-level are simply not "due" and don't appear in the list
4. Discontinued designs are excluded entirely (the query only looks at `status = 'active'`) — per the project owner's direction, there's no point reordering something Pandora no longer makes

### Frontend — `frontend/src/pages/PandoraFunctions.jsx`
A single page (`/pandora-functions`, nav entry in `Layout.jsx` reading "Pandora Functions" with the `PackageSearch` icon — the file/component/route have now been renamed twice: `PandoraReference`/`pandora-reference` → `PandoraOrdering`/`pandora-ordering` → `PandoraFunctions`/`pandora-functions`, per the notes above). Current layout, top to bottom:

- **Header** — title/description on the left, the combined **`UpdateListControl`** on the right (a `<Button>` that toggles an absolutely-positioned popover panel — `left-0 top-full`, anchored to the button's left edge so it can't overlap the sidebar nav). Per the project owner's explicit placement choice (*"Inside the 'Update list' popover as a second tab/mode"*), this single control now centralises **both** ways staff maintain the master list, switchable via a shadcn/ui `Tabs` control inside the popover:
  - **Update** tab — refresh the list from Pandora's full master CSV (the original functionality: file picker, "Update list" submit button, result summary X new / Y updated / Z unchanged, "Last updated: … on …")
  - **Mark Discontinued** tab — the new feature described below
  
  Both tabs share a single generic `ImportPane` component (file picker + submit button + result banner + "last run" footer) parameterised by endpoint, copy, icon/colour, and a `renderResult()` callback for the differently-worded summary — avoiding near-duplicate markup while keeping each mode's wording, icon (`Upload` vs `Ban`), and button colour (default vs `destructive`) distinct
- **Mark Discontinued (new feature)** — lets staff upload a simple list of Design Numbers (one per row, or with a `Design#` column — see `parseDesignNumberList()` above) to flag those designs as discontinued, posting to `POST /pandora/discontinue`. The result banner reports **N design numbers checked — X added as new records, Y newly marked discontinued, Z already discontinued**, and the footer shows "Last run: … on …" (queried separately from the Update tab's history via `GET /imports?kind=discontinue`, vs `kind=update` for the Update tab — each tab tracks its own history independently)
- **`SummaryCards`** — the four stat cards (Total Designs, Active, Discontinued, Total Build-to-Level). The first three are now **clickable `<button>`s** (the `StatBox` component renders as a button with a green "active" ring when `onClick` is provided): clicking **Total Designs** / **Active** / **Discontinued** opens a `MasterListPanel` filtered to `''` (all) / `'active'` / `'discontinued'` respectively — i.e. the cards themselves are now the entry point for browsing the master list by status, replacing the old standalone search/filter card. Clicking the active card again closes the panel (simple toggle: `setMasterListFilter((current) => current === value ? null : value)`)
- **`MasterListPanel`** (conditionally rendered) — a simple status-filtered, paginated table (Design #, Department, Description, Build-to-Level, Status badge) with a close (✕) button and a "Click the same card again, or close, to dismiss this view" hint. Internally just calls the existing `GET /items?status=&page=` endpoint
- **`ReorderCard`** — the new headline feature and main content of the page:
  - A **Department** `<select>` filter (the only filter requested — populated from the summary's department breakdown, each option showing its item count)
  - A **"Generate Order (CSV)"** button that calls `GET /pandora/reorder/export` with `responseType: 'blob'`, then builds an object URL and clicks a programmatic `<a download>` to trigger the browser download (filename includes today's date and, if a department is selected, a `-<department>` suffix, e.g. `pandora-reorder-2026-06-08-bracelets.csv`)
  - A summary line — "**N** designs need restocking [in <department>] — totalling **M** units"
  - A paginated comparison table — Design #, Department, Description, On Hand, Build-to-Level, Reorder Qty, Cost — **sorted by department, then design number** (the default `getReorderComparison` order, matching what the project owner asked for)
  - Changing the department filter resets back to page 1

### New dependencies
`multer` and `csv-parse` were added to `backend/` (`npm install multer csv-parse`) for file upload handling and CSV parsing respectively. No new frontend dependencies were needed for the redesign — the CSV download uses the existing `apiClient` (axios) with `responseType: 'blob'` plus standard browser `URL.createObjectURL` / programmatic-anchor-click APIs.

### Verification notes (local)
**Original Phase 2 import/browse pipeline:** tested against the real supplier file `20251124_Pandora_OrderTemplate_ver4.csv` (3,789 design rows): import succeeded with 0 skipped rows, summary figures matched expectations (3,294 active / 495 discontinued / 2,637 total build-to-level units across departments like Rings, Charms, Bracelets, etc.), and **re-importing the identical file produced `0 inserted / 0 updated / 3,789 unchanged`** — confirming the upsert correctly avoids unnecessary writes on a refresh with no real changes.

**Redesign verification (current shipped layout):**
- Backend `/reorder` and `/reorder/export` were verified directly via `curl` with an auth token: correct pagination, correct department filtering, correct `totalReorderQty`, correct CSV headers/escaping/row counts (full active set: 328 designs need reordering, 369 total units)
- In the browser: clicking each of the **Total Designs / Active / Discontinued** cards opens the `MasterListPanel` with the right filter and title (confirmed the green "active" ring styling and toggle-to-close behaviour on all three)
- The **`UpdateListControl`** popover opens/closes correctly and shows the upload form, "Update list" button, and last-updated info — initial implementation anchored it with `right-0`, which on this page's layout caused a `w-80` (320px) panel to overflow left past the button and overlap the sidebar nav; fixed by anchoring with `left-0` instead so it opens below-right of the button into the open content area
- The **`ReorderCard`**: department filter correctly narrows the table (verified selecting "Bracelets" filtered all visible rows to that department and updated the summary line to "45 designs need restocking in Bracelets — totalling 50 units"); pagination's "Next" button correctly advances to a new page of rows; **"Generate Order (CSV)"** was verified to produce a `text/csv` blob named `pandora-reorder-2026-06-08-bracelets.csv` whose first lines are exactly `Item,Description,Quantity,Cost` followed by correctly-formatted design/description/quantity/cost rows

**"Pandora Functions" rename + Mark Discontinued feature verification:**
- Applied the `kind` column migration directly against the local `pandora_reference` database (`ALTER TABLE pandora_imports ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'update'` + `CHECK` constraint) — confirmed via `information_schema.columns` that the new column landed correctly and existing rows transparently became `kind = 'update'`
- `POST /pandora/discontinue` was tested directly via `curl` with a small headerless test CSV containing one **existing active design** (`549588C00-1`) and one **brand-new fake design** (`TESTNEW-99999`): response correctly reported `rowsTotal: 2, rowsInserted: 1, rowsUpdated: 1, rowsUnchanged: 0`. A direct DB query then confirmed `549588C00-1` was marked `status = 'discontinued'` with its `department`/`description`/`build_to_level` left **completely untouched**, and `TESTNEW-99999` was freshly **inserted** with `status = 'discontinued'`, `build_to_level = 0`, `department`/`description = NULL` (the file provided neither) — exactly the behaviour the project owner asked for. Test rows were cleaned up afterwards (`DELETE`/`UPDATE` back to original state, plus removing the test `pandora_imports` row)
- `GET /imports?kind=update` and `?kind=discontinue` were verified via `curl` to correctly return only their respective history — confirming the two tabs' "last run" footers stay independent
- In the browser: navigated to `/pandora-functions`, opened the renamed **"Pandora Functions"** page (heading, nav label, and sidebar all correctly updated, with the old "Pandora Discontinued" nav entry gone entirely), opened the **Update list** popover, and confirmed both the **Update** and **Mark Discontinued** tabs render with their own help text, file picker, differently-styled submit button (default blue "Update list" vs destructive-red "Mark discontinued" with the `Ban` icon), and independent "Last updated: …" / "Last run: …" footers (the latter correctly reading "No discontinue uploads recorded yet." once the test upload above was cleaned up)

---

## 10. Build & Deployment Workflow

**Local-first, always:**
1. Build and test the feature completely on your local machine (against your local `burrows_jewellers` database)
2. Confirm it works end-to-end (including a visual check in the browser)
3. Only then plan and execute the deployment to the Digital Ocean droplet (`170.64.193.208`) — this will reuse the same patterns established for `burrows-db-sync` (see that project's `HOWTO.md` for server connection details)

Deployment steps for the dashboard itself (Nginx reverse proxy, process manager, subdomain/port, production build) will be documented here once we reach that stage.

---

## 11. Troubleshooting

### Backend won't start / can't connect to the database
- Confirm PostgreSQL is running locally and `burrows_jewellers` exists (this is the same database used by `burrows-db-sync` — if that project works, the credentials should match)
- Check `backend/.env` has the correct `PG*` values

### "Missing or malformed Authorization header" / 401 errors
- You're not logged in, or your session has expired (default: 12 hours) — log in again
- If this happens immediately after logging in, check that `JWT_SECRET` is set in `backend/.env` and the backend was restarted after any `.env` changes

### Frontend shows a network error / can't reach the API
- Confirm the backend is running on port 4000 (`curl http://localhost:4000/api/health`)
- Check `frontend/.env` → `VITE_API_BASE_URL` matches where the backend is actually running
- Check the backend's `FRONTEND_ORIGIN` matches the frontend's actual URL (CORS)

### Forgot the admin password
- You can't "recover" a bcrypt hash — generate a new one (see [Authentication](#4-authentication)) and update `ADMIN_PASSWORD_HASH` in `backend/.env`, then restart the backend

### Frontend looks unstyled / Tailwind classes have no effect
- Confirm `frontend/postcss.config.js` exists and uses the `@tailwindcss/postcss` plugin (Tailwind v4 syntax — the old `tailwind.config.js` content-path approach does not apply here)
- Confirm `src/index.css` starts with `@import "tailwindcss";` and is imported by `main.jsx`
- If you renamed/deleted a `.css` file a component used to import, clear Vite's cache (`rm -rf node_modules/.vite`) and restart the dev server — stale HMR state can cause "Failed to reload ... .css" errors
