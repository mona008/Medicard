# MediCard

AI-assisted emergency medical information wallet. Patients keep allergies,
medications, conditions and emergency contacts in Supabase, and share them with a
rescuer through a revocable QR code.

**Stack:** React 19 + Vite + TypeScript · React Router · Supabase (Postgres + Auth + RLS) ·
zod · Vitest + Testing Library.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in your Supabase project values
npm run dev               # http://localhost:3000
```

The values come from **Supabase Dashboard → Project Settings → API**. The app
detects missing configuration and shows a setup notice instead of crashing; no
screens that need the database work until `.env` is filled in.

`.env` is gitignored. Never prefix a private key with `VITE_` — Vite inlines every
`VITE_*` variable into the public browser bundle.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | oxlint |
| `npm test` / `npm run test:watch` | Vitest unit + component tests |
| `npm run db:verify` | Run the SQL migrations and security checks against a real PostgreSQL (no credentials needed) |

## Database

Migrations live in `supabase/migrations/` and are **additive only** — read
[supabase/README.md](supabase/README.md) for the exact impact of each file, the
security model, the manual admin-bootstrap script, and the RLS verification
scripts. Nothing has been applied to any project yet.

## Safety

- Never enter real patient medical information during development. Use synthetic
  data only.
- MediCard relays information you enter. It does not diagnose, triage, or
  recommend treatment, and it is not a substitute for professional care.
- In an emergency, call your local emergency number first.

## Project layout

```
src/
  lib/        env validation, Supabase client, safe error mapping
  auth/       auth provider, route guards, sign-in / sign-up, schemas
  components/ app shell, error boundary, accessible UI primitives
  pages/      landing, dashboard, 404
supabase/
  migrations/ additive SQL (review, then apply)
  manual/     admin bootstrap + RLS verification scripts you run by hand
dbcheck/      PostgreSQL harness behind `npm run db:verify`
```
