import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved from this file, not from cwd, so `npm run db:verify` works anywhere.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const MANUAL = join(ROOT, 'supabase', 'manual')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

let passed = 0
const failures = []

async function step(label, fn) {
  try {
    await fn()
    console.log(`  ok   ${label}`)
    passed++
  } catch (error) {
    failures.push(label)
    console.log(`  FAIL ${label}`)
    console.log(`       ${String(error.message).split('\n')[0]}`)
  }
}

const db = await PGlite.create({ extensions: { pgcrypto } })

// Runs a manual script and asserts it THROWS, proving the assertions inside
// it have teeth rather than passing vacuously.
async function mustDetectSabotage(label, sabotage, restore, script) {
  await step(label, async () => {
    await db.exec(sabotage)
    let detected = false
    let message = ''
    try {
      await db.exec(script())
    } catch (error) {
      detected = true
      message = String(error.message).split('\n')[0]
    }
    // The script aborted mid-transaction; clear it before restoring.
    await db.exec('rollback;')
    await db.exec(restore)
    if (!detected) throw new Error('script passed against a deliberately broken model')
    if (!message.startsWith('FAIL')) throw new Error(`unexpected error: ${message}`)
  })
}

const SHIM_SQL = `
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth  to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
`

await step('supabase shim (roles, auth schema, default grants)', () => db.exec(SHIM_SQL))

for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  await step(`migration ${file}`, () => db.exec(readFileSync(join(MIGRATIONS, file), 'utf8')))
}

await step('signup trigger creates profile rows', async () => {
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'patient-a@example.test', '{"full_name":"Synthetic Patient A"}'),
      ('${B}', 'patient-b@example.test', '{"full_name":"Synthetic Patient B"}');
  `)
  const r = await db.query(`
    select (select count(*)::int from public.profiles) as profiles,
           (select count(*)::int from public.medical_profiles) as clinical
  `)
  if (r.rows[0].profiles !== 2 || r.rows[0].clinical !== 2) {
    throw new Error(`expected 2+2 rows, got ${JSON.stringify(r.rows[0])}`)
  }
})

await step('synthetic clinical fixtures', () =>
  db.exec(`
    insert into public.allergies (user_id, name, severity, reaction) values
      ('${A}', 'Synthetic allergen A', 'life-threatening', 'synthetic reaction'),
      ('${B}', 'Synthetic allergen B', 'mild', 'synthetic reaction');
    insert into public.medications (user_id, name, dosage, frequency) values
      ('${A}', 'Synthetic medication A', '10 mg', 'daily'),
      ('${B}', 'Synthetic medication B', '5 mg', 'weekly');
    insert into public.conditions (user_id, name, status) values
      ('${A}', 'Synthetic condition A', 'active'),
      ('${B}', 'Synthetic condition B', 'managed');
    insert into public.emergency_contacts (user_id, name, relationship, phone) values
      ('${A}', 'Synthetic Contact A', 'spouse', '+1 555 0100'),
      ('${B}', 'Synthetic Contact B', 'sibling', '+1 555 0200');
  `),
)

await step('backfill 0005 is idempotent', () =>
  db.exec(readFileSync(join(MIGRATIONS, '20261024000005_backfill_profiles.sql'), 'utf8')),
)

function manual(file) {
  return readFileSync(join(MANUAL, file), 'utf8')
    .replaceAll('REPLACE-WITH-USER-A-UUID', A)
    .replaceAll('REPLACE-WITH-USER-B-UUID', B)
}

// Negative controls: break the model on purpose and confirm the script says FAIL.
await mustDetectSabotage(
  '01 negative control: script catches anon read access',
  'grant select on public.allergies to anon;',
  'revoke select on public.allergies from anon;',
  () => manual('01_verify_anon_lockout.sql'),
)

await step('01 anon lockout + single public entry point', () =>
  db.exec(manual('01_verify_anon_lockout.sql')),
)

await mustDetectSabotage(
  '02 negative control: script catches disabled RLS',
  'alter table public.allergies disable row level security;',
  'alter table public.allergies enable row level security;',
  () => manual('02_verify_patient_isolation.sql'),
)

await step('02 patient isolation + token integrity', () =>
  db.exec(manual('02_verify_patient_isolation.sql')),
)

// --- Session-level impersonation, so single-statement queries stay simple. ---
async function asUser(uuid) {
  await db.exec(`reset role;
    set role authenticated;
    set request.jwt.claims = '{"sub":"${uuid}","role":"authenticated"}';`)
}
async function asSuper() {
  await db.exec('reset role; reset request.jwt.claims;')
}
async function mint(user, label, days = null) {
  await asUser(user)
  const r = await db.query(
    `select public.create_emergency_access_token($1::text, ${days === null ? 'null' : Number(days)}) as t`,
    [label],
  )
  return r.rows[0].t
}

await step('valid token returns the right patient card', async () => {
  const token = await mint(A, 'lifecycle test')
  const r = await db.query(`select public.read_emergency_card($1::text) as card`, [token])
  const card = r.rows[0].card
  if (!card) throw new Error('valid token returned nothing')
  if (card.cardholder_name !== 'Synthetic Patient A') throw new Error(`wrong patient: ${card.cardholder_name}`)
  if (card.allergies.length !== 1) throw new Error('allergies missing from card')
  if (card.emergency_contacts.length !== 1) throw new Error('contacts missing from card')
})

await step('revoked token stops returning the card', async () => {
  const token = await mint(A, 'revocation test')
  const before = await db.query(`select public.read_emergency_card($1::text) as card`, [token])
  if (!before.rows[0].card) throw new Error('could not read before revocation')

  await db.exec(`update public.emergency_access_tokens
                    set revoked_at = now()
                  where token_hash = encode(digest('${token}', 'sha256'), 'hex')`)

  const after = await db.query(`select public.read_emergency_card($1::text) as card`, [token])
  if (after.rows[0].card !== null) throw new Error('REVOKED TOKEN STILL RETURNS DATA')
  await asSuper()
})

await step('expired token is rejected', async () => {
  const token = await mint(B, 'expiry test', 1)
  await db.exec(`update public.emergency_access_tokens
                    set expires_at = now() - interval '1 day'
                  where token_hash = encode(digest('${token}', 'sha256'), 'hex')`)
  const after = await db.query(`select public.read_emergency_card($1::text) as card`, [token])
  if (after.rows[0].card !== null) throw new Error('EXPIRED TOKEN STILL RETURNS DATA')
  await asSuper()
})

await step('malformed/absent tokens return null without erroring', async () => {
  for (const bogus of ['', 'nope', 'f'.repeat(64), null, 'z'.repeat(200)]) {
    const r = await db.query(`select public.read_emergency_card($1::text) as card`, [bogus])
    if (r.rows[0].card !== null) throw new Error(`bogus token returned data: ${String(bogus)}`)
  }
})

await step('card payload leaks no internal identifiers', async () => {
  const token = await mint(A, 'payload test')
  const r = await db.query(`select public.read_emergency_card($1::text) as card`, [token])
  const json = JSON.stringify(r.rows[0].card)
  if (json.includes(A) || json.includes(B)) throw new Error('card payload leaks a user id')
  if (json.includes('token_hash') || json.includes('"id"')) throw new Error('card payload leaks internal columns')
  await asSuper()
})

await step('audit log written, and stores no IP / user agent / location', async () => {
  const token = await mint(B, 'audit test')
  await db.query(`select public.read_emergency_card($1::text)`, [token])
  await asSuper()
  const cols = await db.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='emergency_access_log'`,
  )
  const names = cols.rows.map((r) => r.column_name)
  for (const bad of ['ip', 'ip_address', 'user_agent', 'location']) {
    if (names.includes(bad)) throw new Error(`privacy: log stores ${bad}`)
  }
  const log = await db.query(`select count(*)::int as n from public.emergency_access_log`)
  if (log.rows[0].n < 1) throw new Error('audit row was not written')
})

await step('admin table starts empty (no accidental admin grant)', async () => {
  const r = await db.query('select count(*)::int as n from public.admin_roles')
  if (r.rows[0].n !== 0) throw new Error('admin_roles is not empty - bootstrap leak')
})

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join('\n'))
  process.exitCode = 1
}
await db.close()
