# Strautomator Admin

Internal admin panel for [Strautomator](https://strautomator.com), used to manage users, subscriptions, gear, calendars, announcements, notifications and outgoing emails. It is a Nuxt 4 single-page app (SPA, `ssr: false`) using Vuetify and Pinia, with a Nitro server API that runs on top of the [Strautomator Core](../core#readme), installed as a local package (`file:../core`).

## Features

| Page            | Description                                                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index`         | Overview: users (total, PRO, new, logins, active), subscriptions by status / source, integrations, content and GearWear processing stats, recent admin activity                                                                                                                                                               |
| `users`         | Search, filter (PRO, trial, suspended, integrations...) and sort users. The user dialog (`?user=ID`) edits profile, flags and preferences, grants / revokes PRO, edits subscriptions and GearWear components, sends and deletes notifications, shows recipes, calendars, raw data and the admin history, and deletes the user |
| `subscriptions` | Search and filter by status / source, edit subscriptions (status, dates, price, owner, with optional user PRO sync), check / fix Paddle customers                                                                                                                                                                             |
| `gear`          | Search and list GearWear configurations, edit components (distances, times, alerts), enable / disable and delete                                                                                                                                                                                                              |
| `calendars`     | Search and list calendars                                                                                                                                                                                                                                                                                                     |
| `announcements` | Create, edit, duplicate, expire and delete announcements, with targeting (Free / PRO, bikes, shoes, Garmin / Wahoo, registration date, countries)                                                                                                                                                                             |
| `notifications` | Send notifications to one or many users (up to 1000 IDs), list and delete recent notifications                                                                                                                                                                                                                                |
| `mailer`        | Compose and send emails to users                                                                                                                                                                                                                                                                                              |
| `audit`         | Audit log of all changes made through the admin                                                                                                                                                                                                                                                                               |
| `login`         | Google Sign-In                                                                                                                                                                                                                                                                                                                |

Lists are paged (25 per page) and their search, filters and page are kept in the URL, so they can be linked and bookmarked. Firestore needs composite indexes to sort filtered queries, so filtered lists are not sorted.

## Project structure

- `pages/`, `layouts/`, `components/`, `composables/`, `utils/`, `plugins/`, `store/` - frontend (Vue 3, Vuetify, Pinia)
- `middleware/auth.ts` - client route guard, redirects to `login` when not signed in
- `server/api/` - Nitro API endpoints (see below)
- `server/utils/admin.ts` - shared server helpers: audit log, paging, input parsing, sanitized user views
- `server/middleware/auth.ts` - security headers, IP allowlist on all requests, verifies the Google ID token on every `/api` request
- `server/plugins/startup.ts` - starts `strautomator-core` when the server boots

## API

| Endpoint                                                         | Description                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/dashboard`                                             | Overview stats                                                            |
| `GET /api/users`                                                 | Search (`search`) or paged list (`filter`, `sort`, `page`)                |
| `GET / PATCH / DELETE /api/users/:id`                            | User details (with subscriptions, gear, calendars, notifications), update |
| `POST /api/users/:id/pro`                                        | Grant (friend subscription) or revoke PRO                                 |
| `GET /api/subscriptions`, `PATCH /api/subscriptions/:id`         | Search / list (`status`, `source`) and update subscriptions               |
| `GET / POST /api/subscriptions/paddle-customer`                  | Check and fix the user of a Paddle customer                               |
| `GET /api/gear`, `PATCH / DELETE /api/gear/:id`                  | Search / list (`filter`, `sort`) and update GearWear configurations       |
| `GET /api/calendars`                                             | Search / list calendars                                                   |
| `GET / POST /api/announcements`, `DELETE /api/announcements/:id` | List, create / update and delete announcements                            |
| `GET / POST /api/notifications`, `DELETE /api/notifications/:id` | List (`userId`), send and delete notifications                            |
| `POST /api/mailer/send`                                          | Send emails                                                               |
| `GET /api/audit`                                                 | Paged audit log (`target` filter)                                         |

Notes:

- All mutating requests must send a JSON body (requests without a JSON content type are rejected, as CSRF protection). Deletions must also confirm the target ID, with a `{"confirm": "ID"}` body.
- Users are always returned without tokens and other sensitive fields.
- Users with an ongoing Paddle or PayPal subscription cannot be deleted or have PRO revoked. Changes to Paddle / PayPal subscriptions are saved to the database only, not sent to the payment providers.

## Audit log

Every change made through the API (user, subscription, gear, announcement and notification updates, deletions, PRO changes, Paddle customer fixes and emails sent) is saved to the `admin-audit` Firestore collection (with the environment suffix, if any). Each entry has the admin email, action, target ID, details (before / after values), status (`pending`, `succeeded` or `failed`), error and dates. The log can be browsed on the `audit` page, on the dashboard and on each user's "Data" tab.

## Authentication

Admin emails, the Google Sign-In client ID and the allowed IPs are configured via environment variables or a `.env` file — [nuxt.config.ts](nuxt.config.ts) only holds dummy defaults, so no real values are committed to the repository. The Google Sign-In client ID is used by both the sign-in button and the server when verifying ID tokens.

All settings can be overridden at runtime with environment variables, and are picked up by the server and the SPA alike. List settings accept comma-separated values or a JSON array. Note that `authEmails` and `googleSignIn.clientId` live under `public` (the browser needs them for the login flow), so their variables carry the `NUXT_PUBLIC_` prefix:

| Setting                        | Environment variable                   | Format                 |
| ------------------------------ | -------------------------------------- | ---------------------- |
| `adminAllowedIps`              | `NUXT_ADMIN_ALLOWED_IPS`               | comma-separated IPs    |
| `public.authEmails`            | `NUXT_PUBLIC_AUTH_EMAILS`              | comma-separated emails |
| `public.googleSignIn.clientId` | `NUXT_PUBLIC_GOOGLE_SIGN_IN_CLIENT_ID` | string                 |

```sh
docker run -e NUXT_ADMIN_ALLOWED_IPS="192.168.0.1" -e NUXT_PUBLIC_AUTH_EMAILS="admin@google.com" -p 3000:3000 strautomator-admin
```

Variables can also be set in a `.env` file in the `admin` folder (git and Docker ignored, also used to pass `SMU_*` settings to the Core). It is loaded automatically by `make run`, `npm run dev`, `npm run build` and `npm run preview`. When serving the production build directly, use `make serve`, which passes `--env-file-if-exists=.env` to Node (the [Dockerfile](Dockerfile) uses the same flag, but since `.env` is not copied into the image, pass variables with `docker run -e` or mount the file instead).

### IP restriction

Access is restricted by IP on all pages and endpoints, enforced on the server before the Google token check. The allowed IPs are defined in `runtimeConfig.adminAllowedIps`, with no default set (all IPs allowed). The client IP is read from `X-Forwarded-For`, so the app must sit behind a trusted reverse proxy (clients could spoof that header if exposed directly).

## Settings

Settings are handled by [SetMeUp](https://github.com/igoramadas/setmeup) via the Core. The `settings.secret.json` file holds credentials and should not be committed in plain text. Encrypt or decrypt it with:

```sh
make encrypt
make decrypt
```

Please check the [Core](../core/README.md) docs for the available settings and how they are loaded.

Which environment's data the Core loads is decided by `NODE_ENV`: SetMeUp loads `settings.$NODE_ENV.json`. Note that `make run` always runs with `NODE_ENV=development` — Nuxt forces it on the dev server, and `.env` cannot override variables already set in the environment — so `NODE_ENV=production` in `.env` only affects `make serve`.

## Development

Requirements: Node.js 22+ or Bun. The core must be installed (and compiled) first, as the admin installs a copy of it.

```sh
cd core && npm install
cd ../admin && npm install
make run     # copies the latest compiled core and starts the dev server (npm run dev)
```

When you change the core, run `make build` on the `core` folder, then `make run` here again.

Other useful commands:

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Start the Nuxt dev server                |
| `npm run build`    | Production build to `.output/`           |
| `npm run generate` | Generate static output                   |
| `npm run preview`  | Preview the production build             |
| `make serve`       | Serve the production build, loads `.env` |
| `make update`      | Update dependencies and bump the version |
| `make clean`       | Remove `node_modules` and the lockfile   |

On macOS, if `nuxt dev` fails with `Vite Node IPC socket path not configured`, run it with `TMPDIR=/tmp`.

## Deployment

The included [Dockerfile](Dockerfile) builds the app and runs the Nitro server. It must be built from the repository root, as it also needs the local core:

```sh
docker build -f admin/Dockerfile -t strautomator-admin .
docker run -p 3000:3000 strautomator-admin
```

The [Dockerfile.dockerignore](Dockerfile.dockerignore) keeps secrets, the web and the functions out of the build context (BuildKit only).

The [admin-docker.yml](../.github/workflows/admin-docker.yml) GitHub Actions workflow builds the image for `linux/amd64` and `linux/arm64` and pushes it to `ghcr.io/ramadasnet/strautomator-admin`, tagged with the commit SHA and `latest`. It runs only when files under `admin/` change on `master`. Changes to the core alone do not trigger it, so start it manually (workflow dispatch) if the admin needs a new core.

Please read the files under the repository root `.agents/` for deployment, GIT and coding conventions.

## Code style

Prettier is configured in [package.json](package.json): 4 spaces, no semicolons, double quotes, no bracket spacing, 250 columns.
