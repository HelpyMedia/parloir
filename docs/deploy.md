# Deploying the hosted service

Parloir's public instance runs as: **Vercel** (Next.js app) + **Neon** (Postgres
with pgvector) + **Inngest Cloud** (durable debate workflow), with the domain on
Cloudflare. Users bring their own OpenRouter account; the server holds no model
keys.

## 1. Vercel project

1. In Vercel, **Add New → Project**, import `HelpyMedia/parloir`, framework
   Next.js. Vercel uses the `vercel-build` script, which applies database
   migrations (`scripts/migrate.ts`) and then builds.
2. Plan: Vercel's Hobby plan is limited to non-commercial personal use. A
   service run by a company should be on Pro.

## 2. Database (Neon)

1. Project → **Storage → Create → Neon**. This sets `DATABASE_URL` (and
   `DATABASE_URL_UNPOOLED`) for every environment, with a separate branch
   database for previews.
2. Nothing else: the first deploy creates the `vector` extension and every
   table.

## 3. Inngest

1. Project → **Integrations → Inngest**. This sets `INNGEST_EVENT_KEY` and
   `INNGEST_SIGNING_KEY` and syncs `https://<domain>/api/inngest` on deploy.
2. **Deployment Protection**: keep it on, and give Inngest the bypass key
   instead of unprotecting anything.
   - Vercel → Settings → Deployment Protection → **Protection Bypass for
     Automation** → enable and copy the secret.
   - Inngest dashboard → Vercel integration settings → paste it into
     **Deployment protection key** for the project, then redeploy.
   - Optionally set `INNGEST_SERVE_ORIGIN=https://app.parloir.dev` so Inngest
     syncs against the custom domain instead of the `*.vercel.app` URL.
   The custom domain is already public under Standard Protection; there is no
   need to add it to the protection exceptions list.
3. Capacity: Inngest's free plan allows 50k step executions a month and 5
   concurrent steps. A debate uses roughly 25–45 steps, and every turn is a
   step, so 5 concurrent steps means a handful of simultaneous debates before
   turns start queueing. Move to Inngest Pro, or self-host Inngest, when
   traffic grows.

## 4. Environment variables (Production)

| Variable | Value |
|---|---|
| `PARLOIR_HOSTED` | `1` |
| `BETTER_AUTH_URL` | `https://app.parloir.dev` |
| `NEXT_PUBLIC_APP_URL` | `https://app.parloir.dev` |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` |
| `PARLOIR_ENCRYPTION_KEY` | output of `openssl rand -base64 32` — never change it after launch |
| `PARLOIR_VERCEL_ANALYTICS` | `1`; also enable **Analytics** in the Vercel project. Cookieless, so no consent banner |
| `PARLOIR_CONTACT_EMAIL` | address shown on /privacy and /terms |
| `INNGEST_SERVE_ORIGIN` | optional, `https://app.parloir.dev` |
| `RESEND_API_KEY` | optional; turns on email verification for sign-ups |
| `PARLOIR_EMAIL_FROM` | e.g. `Parloir <no-reply@parloir.dev>` (domain verified in Resend) |

`BETTER_AUTH_URL` must be the exact origin people use: every form post is
checked against it, so a request from another hostname is rejected with 403.
Preview deployments therefore need their own `BETTER_AUTH_URL` (or are used
only for reading).

The production build refuses to boot without `INNGEST_SIGNING_KEY`, an https
`BETTER_AUTH_URL` and a 32-byte `PARLOIR_ENCRYPTION_KEY`.

## 5. Domain

Vercel → Domains → add `app.parloir.dev`. In Cloudflare DNS, add the CNAME
Vercel shows, **DNS only** (grey cloud) so Vercel can issue the certificate.
The landing page on `parloir.dev` (Cloudflare Pages) can link to it.

## 6. Smoke test after deploy

1. Sign up, confirm the email if Resend is on.
2. Settings → **Connect with OpenRouter**; you should land back on Settings
   with "OpenRouter is connected".
3. New session → keep "Free models only" → start. Watch the opening
   statements stream, pause, add a note, resume, and export the summary.
4. In Inngest's dashboard the run should show one step per turn and no
   failed steps.

## Running a full debate locally without OpenRouter

```bash
pnpm dev:mock-openrouter                  # terminal 1: fake OpenRouter on :4010
pnpm inngest:dev                          # terminal 2
pnpm dev                                  # terminal 3
```

With `PARLOIR_OPENROUTER_BASE_URL=http://localhost:4010/api/v1` in
`.env.local`, save any string as the OpenRouter key in Settings and run
debates for free. Models whose id contains `broken` fail with 429, which is a
quick way to see skipped turns and the failure screen.
