# StackScout

Type in a website and get a report on what it's built with: CMS, e-commerce platform, frameworks, WordPress plugins and theme, analytics and marketing tools, hosting, DNS/email provider, page count, security headers, SEO basics and page weight. On top of that, it adds **quote insights**: a complexity score plus scoping notes and upsell opportunities.

Detection uses the open-source **webappanalyzer** fingerprint database (7,700+ technologies), a community-maintained fork of the old open Wappalyzer data. The scanner loads each site in headless Chromium, so it catches technologies that only appear after JavaScript runs.

## Quick start

Requires Node 20.11+ and Docker Desktop (for local Supabase). Works on macOS and Windows.

```bash
npm install
npm run setup        # downloads Chromium + fingerprint data
npm run db:start     # local Supabase in Docker (first run downloads ~3–4 GB)
npm run db:env       # writes server/.env and client/.env
npm run dev          # API on :8787, app on http://localhost:5173
```

Sign in with `demo@example.com` / `password123`.

See **[LOCAL_SUPABASE.md](LOCAL_SUPABASE.md)** for how the backend fits together, local URLs and keys, calling the API with curl/Postman, and troubleshooting.

## Project layout

```
client/     React + Vite + Tailwind UI (login, scanner, history, report)
server/     Node API (Express) + scanner engine
  src/scan/   framework-agnostic scanner: scanUrl(url) → ScanReport
    browser.ts      headless Chromium collector (JS globals, DOM, requests, screenshot)
    fetchMode.ts    fallback collector without a browser
    matcher.ts      fingerprint engine (patterns, versions, implies/requires/excludes)
    extras/         WordPress, Shopify, sitemap, DNS, TLS, security, performance probes
    insights.ts     complexity score + quoting notes
  data/fingerprints/  vendored fingerprint JSON (npm run fingerprints to refresh)
shared/     report types used by both sides
supabase/   config, migrations, seed (local dev)
scripts/    cross-platform Node helper scripts
```

## Useful commands

| Command | |
|---|---|
| `npm run dev` | Run the API and app together |
| `npm test` | Scanner unit tests |
| `npm run typecheck` | TypeScript check for both packages |
| `npm run scan -w server -- example.com` | Scan from the terminal (no login or DB needed) |
| `npm run fingerprints:latest` | Update fingerprints to the newest upstream commit |

## Deploying online

The app is hosted in three parts:

```
Browser ──▶ Netlify   (React app, static files from client/dist)
   ├──────▶ Supabase  (sign-in, database, screenshot storage)
   └──────▶ Render    (scanner API in Docker with headless Chromium) ──▶ Supabase
```

Netlify hosts the frontend only. The scanner runs a real Chromium browser, which is too big and too slow for Netlify Functions, so the API runs as a Docker container on Render. Both are already configured: `netlify.toml` covers the frontend and `render.yaml` covers the API.

Do the steps in order, because each one gives you a URL or key that the next step needs.

### 1. Push the code to GitHub

```bash
git add -A
git commit -m "Initial commit"
gh repo create stackscout --private --source . --push   # or create the repo on github.com and push
```

`.env` files are gitignored, so no keys get committed.

### 2. Create the hosted Supabase project

1. Go to [supabase.com](https://supabase.com), click **New project**, choose a region close to your users, and save the database password somewhere.
2. Link it and apply the schema from this folder:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>   # the ref is in the project URL: https://<project-ref>.supabase.co
   npx supabase db push                            # applies supabase/migrations (tables, RLS, screenshots bucket)
   ```
   Don't run `seed.sql` in production. It only creates the demo users.
3. In **Project Settings → API**, copy:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **anon / publishable key**: this goes to Netlify
   - **service_role / secret key**: this goes to Render only. Never put it in a `VITE_` variable.
4. Optional: in **Authentication → Providers → Email**, choose whether new sign-ups must confirm their email. Confirmation is on by default in hosted projects.

### 3. Deploy the scanner API on Render

1. Go to [render.com](https://render.com), then **New → Blueprint**, connect GitHub and pick the repo. Render reads `render.yaml`.
2. Render asks for the secret values:
   - `SUPABASE_URL`: the Project URL from step 2
   - `SUPABASE_SERVICE_ROLE_KEY`: the service_role key from step 2
   - `CLIENT_ORIGIN`: you don't know the Netlify URL yet, so enter `http://localhost:5173` for now. You'll fix it in step 5.
3. Click **Apply**. The first build takes a few minutes because the Playwright image is large.
4. Copy the service URL, for example `https://stackscout-api.onrender.com`, and check it:
   ```bash
   curl https://stackscout-api.onrender.com/api/health
   # → {"ok":true,"technologies":7700+,...}
   ```

The Blueprint uses the **Starter** plan. Chromium needs more memory than the free tier has, and free services sleep when idle. Each scan uses about 300–500 MB, so keep `MAX_CONCURRENT_SCANS=1` unless you move to a bigger plan.

### 4. Deploy the frontend on Netlify

1. Go to [app.netlify.com](https://app.netlify.com), then **Add new site → Import an existing project → GitHub** and pick the repo.
2. Leave the build settings alone. `netlify.toml` already sets them (`npm run build -w client`, publish folder `client/dist`).
3. Under **Environment variables**, add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
   | `VITE_API_URL` | Render URL from step 3, without a trailing slash |
   | `VITE_ENABLE_GOOGLE` | `false` |

4. Click **Deploy**. Copy the site URL, for example `https://stackscout.netlify.app`. You can rename the site under **Site configuration → Change site name**.

`VITE_` variables are built into the JavaScript bundle, so changing one only takes effect after you redeploy (**Deploys → Trigger deploy**).

### 5. Connect the pieces

1. **Render → stackscout-api → Environment:** set `CLIENT_ORIGIN` to your Netlify URL, e.g. `https://stackscout.netlify.app`. Add more origins separated by commas, such as a custom domain. Save, and Render redeploys. If this is wrong, scans fail with a CORS error in the browser console.
2. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** your Netlify URL
   - **Redirect URLs:** your Netlify URL, plus `https://*--<site-name>.netlify.app/**` if you want sign-in to work on Deploy Previews
3. **Your account:** open the Netlify site and sign up. To give yourself a higher quota, go to Supabase → **Table editor → profiles** and set `plan` to `pro` or `agency`.

### 6. Check that it works

- The Netlify site loads, and refreshing on `/history` doesn't give a 404.
- Signing up and signing in work.
- A scan of `example.com` finishes, then appears in History with a screenshot.
- The browser console shows no CORS or 401 errors.

### Updating

Push to `main`, and Netlify and Render both redeploy automatically. For database changes, add a new migration in `supabase/migrations/`, test it locally with `npm run db:reset`, then run `npx supabase db push`.

### Custom domain (optional)

Add the domain in Netlify (**Domain management**), then add it to `CLIENT_ORIGIN` on Render and to the Site URL and Redirect URLs in Supabase.

### Troubleshooting

| Symptom | Fix |
|---|---|
| App says "Supabase isn't configured" | `VITE_SUPABASE_*` were missing at build time. Set them in Netlify and trigger a redeploy. |
| Scan fails with a CORS error | `CLIENT_ORIGIN` on Render doesn't exactly match the site's origin (`https://…`, no trailing slash). |
| API returns `503 Authentication service unavailable` | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` on Render is wrong. |
| Render service restarts during scans | It's running out of memory. Use a bigger plan or keep `MAX_CONCURRENT_SCANS=1`. |
| Sign-in email links go to localhost | Set the Site URL in Supabase → Authentication → URL Configuration. |

## Notes

- The fingerprint data is GPL-3.0. Running it as a hosted service is fine, but don't brand the product with the "Wappalyzer" name.
- Scans block private and internal IP addresses (SSRF protection), including targets reached through redirects. Set `ALLOW_PRIVATE_TARGETS=true` in `server/.env` to scan sites on your own network.
- Results are best-effort. Plugins that only run in the admin area, and server-side code, can't be seen from outside.
