# Working with the local Supabase backend

StackScout uses **Supabase** for authentication and the database (users, scan history, screenshots), and a **Node API** (`server/`) for the actual website scanning. In development, Supabase runs entirely on your machine inside Docker. Nothing goes to the cloud.

```
 Browser (React, :5173)
   │  ① sign in ───────────────▶  Supabase Auth      (127.0.0.1:54321/auth/v1)
   │  ② read own scan history ─▶  Supabase REST/RLS  (127.0.0.1:54321/rest/v1)
   │  ③ POST /api/scan + JWT ──▶  Node scanner API   (localhost:8787)
   │                                 │ verifies JWT with Supabase Auth
   │                                 │ runs headless Chromium
   │                                 └▶ writes scan + screenshot with the service-role key
```

---

## 1. Prerequisites

| Tool | Mac | Windows |
|---|---|---|
| **Docker Desktop** | [docker.com](https://www.docker.com/products/docker-desktop/) | Same (enable the WSL 2 backend) |
| **Node.js 20.11+** | `brew install node` or nvm | [nodejs.org](https://nodejs.org) or nvm-windows |
| **Supabase CLI** | Installed automatically as a dev dependency (`npx supabase …`) | Same |

Docker Desktop must be **running** before you start Supabase. The first start downloads about 3–4 GB of images, so make sure you have **at least 10 GB of free disk space**.

## 2. Start it

From the project root:

```bash
npm run db:start      # starts Postgres, Auth, REST, Storage, Studio, Mailpit in Docker
npm run db:env        # writes the local URLs + keys into server/.env and client/.env
npm run dev           # starts the API (:8787) and the React app (:5173)
```

The first `db:start` applies `supabase/migrations/*.sql` and runs `supabase/seed.sql`.

Open **http://localhost:5173** and sign in with a seeded account:

| Email | Password | Plan |
|---|---|---|
| `demo@example.com` | `password123` | pro |
| `demo2@example.com` | `password123` | free |

## 3. Local URLs

| What | URL | Notes |
|---|---|---|
| **API gateway** (Auth, REST, Storage) | http://127.0.0.1:54321 | What `SUPABASE_URL` points at |
| **Studio** (database admin UI) | http://127.0.0.1:54323 | Browse tables, run SQL, manage users |
| **Mailpit** (fake email inbox) | http://127.0.0.1:54324 | Magic-link and confirmation emails land here |
| **Postgres** (direct) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Use with TablePlus, DBeaver, psql, etc. |
| **Node scanner API** | http://localhost:8787 | Our own backend |
| **React app** | http://localhost:5173 | Vite dev server; proxies `/api` to :8787 |

Run `npm run db:status` at any time to print these URLs plus the API keys.

## 4. Keys: which one goes where

`npm run db:status` shows two keys. Local keys are the same on every machine, are only for development, and must never be used in production.

| Key | Where it goes | Safe in the browser? | What it can do |
|---|---|---|---|
| **anon / publishable** | `client/.env` → `VITE_SUPABASE_ANON_KEY` | ✅ Yes | Only what Row Level Security allows the signed-in user |
| **service_role / secret** | `server/.env` → `SUPABASE_SERVICE_ROLE_KEY` | ❌ **Never** | Bypasses RLS: full read/write on everything |

`npm run db:env` copies both into the right files for you.

## 5. Database schema

Defined in `supabase/migrations/20261117000000_init.sql`:

- **`profiles`**: one row per user (created by a trigger on signup). Holds `plan` (`free`/`pro`/`agency`), `scans_this_month`, `usage_month`.
- **`scans`**: one row per scan: `url`, `host`, `status` (`running`/`complete`/`failed`), `primary_stack`, `tech_names[]` (for filtering), and the full `report` as JSONB.
- **Storage bucket `screenshots`**: private; files at `<user_id>/<scan_id>.jpg`.
- **Functions**: `consume_scan_credit(user, limit)` and `refund_scan_credit(user)`. Only callable by the service role.

**Row Level Security:** a signed-in user can `select`/`delete` only their own scans and screenshots and `select` only their own profile. Only the API server inserts or updates scans, so users can't fake a report or reset their quota.

Monthly quotas per plan are set in `server/.env` (`FREE_MONTHLY_SCANS`, `PRO_MONTHLY_SCANS`, `AGENCY_MONTHLY_SCANS`). To change a user's plan locally, edit their row in Studio → Table editor → `profiles`.

## 6. Calling the backend directly (curl / Postman)

Every `/api/*` route except `/api/health` needs a Supabase **access token** (a JWT) for a signed-in user.

**Step 1: get an access token** by signing in with the seeded user through Supabase Auth:

```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password123"}'
```

Copy `access_token` from the response. It lasts 1 hour.

> **Windows PowerShell:** use `curl.exe` (not the `curl` alias), and escape the inner quotes in `-d`, or use Postman instead.

**Step 2: call the scanner API**

```bash
# Health check (no auth)
curl http://localhost:8787/api/health

# Current user + usage
curl http://localhost:8787/api/me -H "Authorization: Bearer <ACCESS_TOKEN>"

# Run a scan (takes 5–30 seconds)
curl -X POST http://localhost:8787/api/scan \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"url":"example.com"}'
```

**Step 3: read saved scans straight from Supabase** (RLS limits this to the signed-in user's own rows):

```bash
curl 'http://127.0.0.1:54321/rest/v1/scans?select=id,host,primary_stack,created_at&order=created_at.desc' \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Postman tip:** make an environment with `anonKey` and `accessToken` variables, add a "Sign in" request for Step 1, and in its Tests tab put
`pm.environment.set("accessToken", pm.response.json().access_token);`
Then every other request can use `Authorization: Bearer {{accessToken}}`.

### API reference

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/health` | none | – | `{ ok, technologies, fingerprints }` |
| GET | `/api/me` | Bearer | – | `{ email, usage: { plan, used, limit } }` |
| POST | `/api/scan` | Bearer | `{ "url": "example.com" }` | `{ scan: ScanRow, usage }` |

Errors come back as `{ "error": "message" }` with these status codes:
- `400`: invalid or blocked URL
- `401`: not signed in or token expired
- `422`: site unreachable or timed out
- `429`: a scan is already running, or the monthly quota is used up
- `503`: the scanner is busy or Supabase is down

The report shape is defined in `shared/report.ts`.

### Scanning without Supabase

To test detection only, the CLI skips auth and the database entirely:

```bash
npm run scan -w server -- example.com            # readable summary
npm run scan -w server -- example.com --json     # full report JSON
npm run scan -w server -- example.com --fetch    # no headless browser
```

## 7. Everyday commands

| Command | What it does |
|---|---|
| `npm run db:start` | Start the local stack (data persists between restarts) |
| `npm run db:stop` | Stop the containers (data is kept) |
| `npm run db:status` | Show URLs and keys |
| `npm run db:reset` | **Wipe the database**, re-run all migrations, then `seed.sql` |
| `npm run db:env` | Rewrite `server/.env` and `client/.env` from the running stack |
| `npx supabase migration new <name>` | Create a new migration file in `supabase/migrations/` |
| `npx supabase db diff -f <name>` | Generate a migration from changes you made in Studio |

**Schema changes:** add a new file in `supabase/migrations/` (never edit one that's already applied), then run `npm run db:reset` locally.

## 8. Signing in by email locally

- **Password sign-up** works instantly. Email confirmation is turned off locally in `supabase/config.toml` (`enable_confirmations = false`).
- **Magic links** are "sent" to **Mailpit** at http://127.0.0.1:54324. Open it and click the link.
- **Google sign-in** is off by default. To enable it:
  1. Create OAuth credentials in Google Cloud with the redirect URI `http://127.0.0.1:54321/auth/v1/callback`.
  2. Uncomment the `[auth.external.google]` block in `supabase/config.toml`.
  3. Set `SUPABASE_AUTH_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_GOOGLE_SECRET` in your shell.
  4. Restart with `npm run db:stop && npm run db:start`.
  5. Set `VITE_ENABLE_GOOGLE=true` in `client/.env`.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `failed to connect to the docker API` | Docker Desktop isn't running. Start it and wait for it to say "running". |
| `input/output error` / `read-only file system` during image pulls | Docker ran out of disk. Free up disk space (aim for 10 GB+), then restart Docker Desktop. If it persists: Docker Desktop → Troubleshoot → Clean / Purge data. |
| `supabase_studio` / `supabase_pg_meta` "unhealthy" (containers restart with exit code 139) | A Docker image layer was damaged, usually by an earlier crash or full disk. The app doesn't need these two, so run `npx supabase start -x studio,postgres-meta` (use TablePlus or another Postgres client on port 54322 instead of Studio). To repair just those two images without touching other projects: copy `/usr/local/bin/node` out of the `node:22.23.3-bookworm` image (`docker create` + `docker cp`), copy it into a container made from each broken image, and `docker commit` that container back to the same image tag. Avoid Docker Desktop's **Clean / Purge data** if you have other local projects, because it also deletes their databases. |
| Port already in use (54321–54324) | Another Supabase project is running. Run `npx supabase stop --all` or change the ports in `supabase/config.toml`. |
| App says "Supabase isn't configured" | Run `npm run db:env`, then restart `npm run dev` (Vite reads `.env` only at startup). |
| API returns `401` | The token expired after 1 hour. Sign in again, or get a fresh token (Step 1 above). |
| API returns `503 Authentication service unavailable` | Supabase isn't running, or `server/.env` has the wrong URL or key. |
| Scans fall back to "Partial (no browser)" | Chromium isn't installed. Run `npm run browsers`. |
| Seeded demo users missing | Seed only runs on first start or on `npm run db:reset`. |

## 10. Moving to hosted Supabase later

1. Create a project at supabase.com.
2. Run `npx supabase link --project-ref <ref>`.
3. Run `npx supabase db push` to apply the same migrations. Don't run `seed.sql` in production.
4. Put the hosted project's URL and keys in your deployed API's environment (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and in Netlify (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`).
5. In Auth settings, set the **Site URL** and **redirect URLs** to your Netlify domain.
