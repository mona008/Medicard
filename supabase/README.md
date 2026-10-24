# MediCard database

All database changes are **additive migration files** in `migrations/`. Nothing in
this directory has been applied to your Supabase project automatically — you review
and run them.

## Migrations (apply in order)

| File | Creates | Alters/drops existing objects? |
|---|---|---|
| `20261024000001_init_schema.sql` | 9 new tables, `set_updated_at()`, `is_admin()`, triggers on the new tables | No |
| `20261024000002_profile_bootstrap.sql` | `handle_new_user()` + one guarded trigger on `auth.users` | No |
| `20261024000003_row_level_security.sql` | RLS enabled + policies on the 9 new tables; `anon` privileges revoked on them | No |
| `20261024000004_emergency_access.sql` | `create_emergency_access_token()`, `read_emergency_card()` | No |
| `20261024000005_backfill_profiles.sql` | Profile rows for accounts that already exist | No |

Every statement is guarded (`IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT DO NOTHING`),
so re-running is safe. **No existing table, column, policy, function, or user account
is modified, dropped, or reset.**

## How to apply

1. Review the files above.
2. Apply them with the Supabase CLI from the project root:
   ```
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   or paste them one at a time into **Dashboard → SQL Editor**, in filename order.
3. Run the manual scripts (below).
4. Run the verification scripts and confirm every line prints `PASS`.

## Manual scripts — you run these, deliberately

| File | Why it is manual |
|---|---|
| `manual/promote_admin.sql` | RLS has no policy letting a user insert their own admin row, so the first administrator must be granted out-of-band. **Edit the placeholder UUID first.** |
| `manual/01_verify_anon_lockout.sql` | Proves `anon` cannot read any patient table and cannot mint tokens. |
| `manual/02_verify_patient_isolation.sql` | Proves patient A cannot see or write patient B's data. **Edit both UUIDs first.** Requires two test accounts with synthetic rows. |

## Security model in one page

**Patient data isolation.** Every patient-facing RLS policy compares a column to
`auth.uid()`. No policy trusts an id sent by the client. `medical_profiles`,
`allergies`, `medications`, `conditions` and `emergency_contacts` are visible **only**
to their owner — deliberately not even to administrators, because administrative
access is not a care relationship.

**QR emergency access.**
- 32 random bytes → 64 hex chars → 256 bits of entropy.
- Generated inside a `SECURITY DEFINER` function and returned **once**; only
  SHA-256(token) is stored. A leaked database dump cannot be replayed as a QR code.
- The token is opaque: it encodes no patient data, no user id, no sequence number.
- Revocable: `revoked_at` / `expires_at` are checked on **every** read, so a revoked
  QR code stops working on the next request.
- Clients cannot insert token rows or write the `token_hash` column, so nobody can
  register a hash they already know (e.g. SHA-256 of `1234`).
- Revocation is an `UPDATE`, never a `DELETE`, so a revoked token stays revoked.

**Anonymous surface.** `anon` has no table privileges at all. The single anonymous
entry point is `read_emergency_card(token)`, which returns `NULL` — not an error —
for unknown, expired or revoked tokens.

**Audit log.** Records `token_id` and `accessed_at` only. No IP address, no user
agent, no location: tracking a bystander's device would be a privacy liability and
adds nothing to revocation decisions.

## Automated verification — `npm run db:verify`

`dbcheck/validate.mjs` boots a real PostgreSQL (PGlite/WASM) with a Supabase-like
shim — `anon` / `authenticated` roles, an `auth` schema, `auth.uid()`, and Supabase's
default table grants — then applies migrations 0001–0005 and exercises the model:

- all five migrations apply cleanly and 0005 is idempotent
- the signup trigger creates profile rows for new accounts
- **negative controls**: it deliberately grants `anon` read access, and deliberately
disables RLS, and asserts that the verification scripts then report `FAIL`. This
proves the assertions have teeth instead of passing vacuously.
- valid token → correct patient card; revoked token → null; expired token → null
- malformed / absent / oversized tokens → `null`, never an error
- the card payload leaks no user id, token hash, or internal column
- the audit log stores no IP, user agent, or location
- `admin_roles` starts empty

It needs no Supabase credentials and writes nothing to your project. Run it after
every migration change.

## Known limitations (tracked, not forgotten)

1. **No per-IP rate limiting at the database layer.** Supabase's API gateway limits
   apply, and 256-bit entropy makes online guessing infeasible; worth adding an Edge
   Function in front if abuse ever appears.
2. **`auth.users` trigger runs on future signups only** — hence migration 0005.
3. **Email confirmation** depends on your Supabase Auth settings, which are untouched.
4. **HIPAA / BAA** is an organisational decision (Supabase plan + AI provider), not
   something SQL can provide.
