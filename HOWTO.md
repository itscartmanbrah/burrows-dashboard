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
7. [Store Performance Dashboard — How the Widgets Work](#7-store-performance-dashboard--how-the-widgets-work)
8. [Build & Deployment Workflow](#8-build--deployment-workflow)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Project Overview

The Burrows Dashboard is a web application that sits on top of the `burrows_jewellers` PostgreSQL database (populated daily by the `burrows-db-sync` project). It is the **single, central interface** for staff to interact with the data — financial tools, inventory tools, ordering tools, etc. all live inside this one app.

It consists of two parts:
- **`backend/`** — a Node.js/Express REST API that talks to PostgreSQL and exposes data to the frontend (with authentication)
- **`frontend/`** — a React (Vite) single-page application — the actual dashboard UI

**Current status:**
- ✅ **Phase 0 — Foundations:** Backend API with JWT-based admin login + working DB connection; frontend shell with login, protected routes, and sidebar navigation.
- ✅ **Phase 1 — Store Performance Dashboard (partial):** The homepage now shows two **live** widgets:
  - **Today's Sales by Store** — transaction count and total tendered (collected) sales per store for the current date
  - **Highest Supplier Cost (Stock on Hand)** — total inventory cost value (cost price × quantity on hand) ranked by vendor
- ⏳ **Phase 3 (pending):** A third homepage widget — *current Pandora stock cost* — will be added once the Pandora reference data (build-to-levels / discontinued list CSV) has been imported in Phase 2.

**Planned tools (placeholders currently in the nav, to be built in later phases):**
- **Store Performance Dashboard** (homepage) — ✅ partially live (see above); Pandora stock-cost widget pending
- **Showcase Debt Reduction** — tracks debt paydown using Xero + sales/cost data
- **Pandora Ordering** — generates reorder suggestions from a supplier build-to-level CSV vs. current stock
- **Pandora Discontinued Products** — marks/manages discontinued Pandora design numbers

---

## 2. Project Structure

```
burrows-dashboard/
├── backend/
│   ├── index.js              # Express app entry point
│   ├── db/
│   │   └── pool.js           # PostgreSQL connection pool (burrows_jewellers)
│   ├── middleware/
│   │   └── auth.js           # JWT verification middleware (requireAuth)
│   ├── routes/
│   │   ├── auth.js           # POST /api/auth/login
│   │   ├── health.js         # GET  /api/health  (DB connectivity check)
│   │   └── dashboard.js      # GET  /api/dashboard/today-sales, /top-suppliers
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
│   │   ├── components/
│   │   │   ├── Layout.jsx    # Sidebar + nav shell for authenticated pages
│   │   │   └── ProtectedRoute.jsx # Redirects to /login if not authenticated
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── StorePerformance.jsx  # Homepage — live widgets (today's sales, top suppliers)
│   │   │   ├── StorePerformance.css
│   │   │   └── Placeholder.jsx       # Generic "coming soon" page for unbuilt tools
│   │   ├── App.jsx           # Route definitions
│   │   └── main.jsx          # App bootstrap
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

## 7. Store Performance Dashboard — How the Widgets Work

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

## 8. Build & Deployment Workflow

**Local-first, always:**
1. Build and test the feature completely on your local machine (against your local `burrows_jewellers` database)
2. Confirm it works end-to-end (including a visual check in the browser)
3. Only then plan and execute the deployment to the Digital Ocean droplet (`170.64.193.208`) — this will reuse the same patterns established for `burrows-db-sync` (see that project's `HOWTO.md` for server connection details)

Deployment steps for the dashboard itself (Nginx reverse proxy, process manager, subdomain/port, production build) will be documented here once we reach that stage.

---

## 9. Troubleshooting

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
