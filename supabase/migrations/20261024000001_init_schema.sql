-- ============================================================================
-- 20261024000001_init_schema.sql
-- MediCard: additive schema for patient medical data.
--
-- IMPACT (read before applying):
--   * Creates NEW tables in the `public` schema. It does not drop, rename,
--     or alter any existing table, column, function, or policy.
--   * Adds new helper functions: public.set_updated_at(), public.is_admin().
--   * Adds new triggers to the tables it creates, plus one trigger on
--     auth.users (guarded by a DO block, so it is added only once).
--   * `create extension if not exists pgcrypto` is a no-op when pgcrypto is
--     already installed (it is present by default on Supabase).
--   * REQUIRES superuser/owner rights (normal for supabase CLI migrations or
--     the SQL editor run as `postgres`).
--
-- SAFE TO RE-RUN: every statement is guarded (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at honest without trusting the client.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account-level profile (created automatically by migration 0002).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 120)
);

-- ---------------------------------------------------------------------------
-- Clinical profile: one row per patient.
--   Nullable by design - an empty profile is valid and still useful in an
--   emergency (an empty "allergies" list is itself information).
-- ---------------------------------------------------------------------------
create table if not exists public.medical_profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  date_of_birth    date,
  blood_type       text not null default 'Unknown'
                   check (blood_type in
                     ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown')),
  height_cm        numeric(5, 1) check (height_cm is null or (height_cm > 0 and height_cm < 300)),
  weight_kg        numeric(5, 1) check (weight_kg is null or (weight_kg > 0 and weight_kg < 500)),
  physician_name   text check (physician_name is null or char_length(physician_name) <= 160),
  physician_phone  text check (physician_phone is null or char_length(physician_phone) <= 40),
  notes            text check (notes is null or char_length(notes) <= 4000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- List-style clinical records. All are scoped to one patient via user_id.
-- ---------------------------------------------------------------------------
create table if not exists public.allergies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  severity   text not null default 'moderate'
             check (severity in ('mild', 'moderate', 'severe', 'life-threatening')),
  reaction   text check (reaction is null or char_length(reaction) <= 500),
  notes      text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists allergies_user_id_idx on public.allergies (user_id);

create table if not exists public.medications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  dosage     text check (dosage is null or char_length(dosage) <= 120),
  frequency  text check (frequency is null or char_length(frequency) <= 120),
  prescriber text check (prescriber is null or char_length(prescriber) <= 160),
  notes      text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medications_user_id_idx on public.medications (user_id);

create table if not exists public.conditions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  diagnosed_on date check (diagnosed_on is null or diagnosed_on <= current_date),
  status      text not null default 'active'
              check (status in ('active', 'managed', 'resolved', 'inactive')),
  notes       text check (notes is null or char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conditions_user_id_idx on public.conditions (user_id);

-- ---------------------------------------------------------------------------
-- Emergency contacts.
--
-- The phone CHECK is deliberately permissive (must contain a digit and fit a
-- short length) so international formats, extensions and punctuation are not
-- rejected at the database layer after the user has typed them.
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_contacts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 160),
  relationship    text check (relationship is null or char_length(relationship) <= 80),
  phone           text not null check (
                    char_length(phone) between 5 and 40 and phone ~ '[0-9]'
                  ),
  secondary_phone text check (secondary_phone is null or char_length(secondary_phone) <= 40),
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists emergency_contacts_user_id_idx on public.emergency_contacts (user_id);

-- ---------------------------------------------------------------------------
-- QR emergency access tokens.
--
-- ONLY THE HASH IS EVER STORED. The 256-bit plaintext token is generated
-- inside create_emergency_access_token() and returned to the caller exactly
-- once; the column below holds hex-encoded SHA-256 of it. Anyone who reads
-- this table - including a database backup leak - cannot recover a working
-- token from it.
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_access_tokens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  token_hash       text not null unique check (char_length(token_hash) = 64),
  label            text not null default 'Emergency card'
                   check (char_length(label) between 1 and 80),
  expires_at       timestamptz,
  revoked_at       timestamptz,
  access_count     integer not null default 0 check (access_count >= 0),
  last_accessed_at timestamptz,
  created_at       timestamptz not null default now(),
  constraint revoked_not_before_created check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists emergency_access_tokens_user_id_idx
  on public.emergency_access_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Audit trail of emergency reads. No IP address, no user agent, no location:
-- an emergency-access log that tracked a bystander's device would be a
-- privacy liability, and it adds nothing to revocation decisions.
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_access_log (
  id          uuid primary key default gen_random_uuid(),
  token_id    uuid not null references public.emergency_access_tokens (id) on delete cascade,
  accessed_at timestamptz not null default now()
);

create index if not exists emergency_access_log_token_id_idx
  on public.emergency_access_log (token_id, accessed_at desc);

-- ---------------------------------------------------------------------------
-- Administrative roles. Deliberately empty until you grant one explicitly
-- (see 20261024000004_admin_bootstrap.sql). No role can be self-assigned.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin', 'support')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared helper: is the current JWT holder an administrator?
--
-- SECURITY DEFINER is required: it reads public.admin_roles, which itself has
-- RLS policies that call this function. Reading as the function owner breaks
-- what would otherwise be infinite recursion. It exposes only a boolean.
--
-- Declared AFTER admin_roles because PostgreSQL validates SQL function bodies
-- at creation time (check_function_bodies).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_roles r
    where r.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at triggers (guarded so the migration can be re-run safely).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'medical_profiles', 'allergies',
    'medications', 'conditions', 'emergency_contacts'
  ]
  loop
    execute format(
      'drop trigger if exists trg_%s_set_updated_at on public.%I;', t, t
    );
    execute format(
      'create trigger trg_%s_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t, t
    );
  end loop;
end $$;
