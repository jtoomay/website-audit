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

## Deploying later

- **Frontend → Netlify:** `netlify.toml` is already set up. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` in Netlify.
- **Scanner API → a container host** (Render, Fly.io, Railway, a VPS): `docker build -f server/Dockerfile .` builds on the official Playwright image, which includes Chromium. Netlify Functions aren't a good fit for a headless browser because of their time and size limits.
- **Supabase → hosted project:** see section 10 of LOCAL_SUPABASE.md.

## Notes

- The fingerprint data is GPL-3.0. Running it as a hosted service is fine, but don't brand the product with the "Wappalyzer" name.
- Scans block private and internal IP addresses (SSRF protection), including targets reached through redirects. Set `ALLOW_PRIVATE_TARGETS=true` in `server/.env` to scan sites on your own network.
- Results are best-effort. Plugins that only run in the admin area, and server-side code, can't be seen from outside.
