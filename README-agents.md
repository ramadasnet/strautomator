# Strautomator — agent briefing

Automations for Strava activities (recipes, GearWear mileage, FTP updates, calendar exports). npm monorepo of four modules around Google Cloud (Firestore + Cloud Run + Cloud Functions + Pub/Sub).

## Stack / layout

- Node ≥22.12, npm — each module has its own `package-lock.json`; no root workspace/lockfile
- `core/` `strautomator-core` — all business logic, DB/storage and 3rd-party integrations (Strava, Garmin, Wahoo, Paddle, Google AI…); TS → `lib/` via `tsc`; consumed by web+functions as `file:../core`, never deployed alone
- `web/` `strautomator-web` — Nuxt + Vue 3 + Vuetify: site, API, Strava webhooks, MCP server (`server/mcp/`); deploys to Cloud Run via `cloudbuild.yaml`
- `functions/` `strautomator-functions` — scheduled tasks `hourlyTasks|dailyTasks|weeklyTasks|monthlyTasks|weekendMaintenance` in `index.js`, Cloud Functions 1st gen triggered by Cloud Scheduler → Pub/Sub
- `admin/` — separate Nuxt SPA admin panel, Docker image built by `.github/workflows/admin-docker.yml` (outside Cloud Build; Cloud Build ignores `admin/`)
- GHCR images: `.github/workflows/admin-docker.yml` and `web-docker.yml` push `ghcr.io/ramadasnet/strautomator-{admin,web}` (amd64 + arm64) on `master`; the Dockerfile builder stages run on the native build platform only, as Nuxt bundling hangs or crashes under QEMU
- Firestore is always the database — a GCP project is required even for local dev; GCS holds calendars, GDPR exports and the prod settings bucket
- `deployment/` is gitignored local ops material (startup script, certs)

## Commands

- first setup: `cd core && npm install` — `prepare` compiles `src` → `lib`
- web dev: `cd web && make run` — copies core `settings*.json` + `lib/` into `node_modules/strautomator-core`, then `nuxt dev` :3000 with `STRAUTOMATOR_CRON=true`
- web test: `cd web && npm test` — tsx specs in `server/mcp/*.spec.ts` (only these tests exist)
- build module: `make build` inside `core|web|functions` (tsc / nuxt build)
- functions locally: `cd functions && make build && NODE_ENV=development node -e "require('./index.js').hourlyTasks().then(() => process.exit(0))"`
- settings: `make encrypt`/`make decrypt` (setmeup on `settings.secret.json`) inside `web/` and `functions/`
- release: `make deploy` at root — master-only + clean tree + `git pull --ff-only`, sets date-version `vYY.WWD.1HHMM` on web+functions, tags and pushes → Cloud Build deploys

## Conventions

- After editing `core/src`: `cd core && make build`, then re-run `make run` in web/functions — they get a _copy_ of core (the Makefiles re-copy `lib/` + settings before starting)
- Settings via SetMeUp: `settings.json` committed, `settings.secret.json` gitignored (template `web/settings.secret.json.sample`); prod pulls the encrypted file from a GCS bucket at startup
- GCP service-account key expected at `~/gcp-strautomator.json`
- Versioning is per-deploy `YY.WWD.1HHMM` on web+functions only

## Corner cases

- Always `NODE_ENV=development` when running functions locally — otherwise they use production settings and collections
- `npm run build` in web ends with `node check-bundle.mjs` — a post-build manifest/bundle sanity check that can fail the build
- `web/links/` — per-brand affiliate-link JSONs (awin1/tiddly URLs by country); `web/tunnel` — dev tunnel config file
- `core/dry-run.js` — boots `core.startup(true)` and exits: a smoke test that settings and credentials load

## Pointers

- `SETUP.md` — complete self-host guide (GCP, Strava app, secrets, troubleshooting) · `core/README.md` / `web/README.md` / `functions/README.md` — per-module docs · `REVIEW.md` — PR review-bot instructions
