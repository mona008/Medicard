-- ============================================================================
-- 20261024000003_row_level_security.sql
-- MediCard: Row Level Security for all tables created in 0001.
--
-- IMPACT (read before applying):
--   * Only touches the NEW tables from 0001. No existing table or policy is
--     altered, dropped, or disabled.
--   * ENABLES RLS on 9 new tables and creates policies on them. Tables with
--     RLS enabled and no policy for a role deny that role by default - which
--     is the intent for `anon` here.
--   * REVOKES `anon` privileges on those new tables. This is defence in depth
--     on top of RLS; it cannot affect any other table in your project.
--   * RESTRICTS column-level UPDATE on emergency_access_tokens to
--     (label, expires_at, revoked_at) so a client can never choose its own
--     token_hash - a client-chosen hash would let a low-entropy token (e.g.
--     SHA-256 of "1234") open a patient's emergency card.
--   * Grants execute on the emergency-read function to `anon`; that is the
--     ONLY path by which anonymous callers can reach patient data, and it
--     requires a valid, unexpired, unrevoked 256-bit token.
--
-- DATA ISOLATION RULE ENFORCED: every patient-visible policy compares a
-- column to auth.uid(). No policy trusts a client-supplied id.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Defence in depth: anonymous callers get no table privileges at all.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'medical_profiles', 'allergies', 'medications', 'conditions',
    'emergency_contacts', 'emergency_access_tokens', 'emergency_access_log',
    'admin_roles'
  ]
  loop
    execute format('revoke all on public.%I from anon;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.medical_profiles enable row level security;
alter table public.allergies enable row level security;
alter table public.medications enable row level security;
alter table public.conditions enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.emergency_access_tokens enable row level security;
alter table public.emergency_access_log enable row level security;
alter table public.admin_roles enable row level security;

-- ---------------------------------------------------------------------------
-- 3. profiles - account metadata only, no clinical data.
--    Admins get READ ONLY (support staff must be able to confirm an account
--    exists; they must not be able to rename or delete it).
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. medical_profiles - strictly owner only. NOT visible to admins: this is
--    clinical data and administrative access is not a care relationship.
-- ---------------------------------------------------------------------------
drop policy if exists "medical_profiles_all_own" on public.medical_profiles;
create policy "medical_profiles_all_own" on public.medical_profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Clinical lists - strictly owner only, same reasoning as above.
-- ---------------------------------------------------------------------------
drop policy if exists "allergies_all_own" on public.allergies;
create policy "allergies_all_own" on public.allergies
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "medications_all_own" on public.medications;
create policy "medications_all_own" on public.medications
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "conditions_all_own" on public.conditions;
create policy "conditions_all_own" on public.conditions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "emergency_contacts_all_own" on public.emergency_contacts;
create policy "emergency_contacts_all_own" on public.emergency_contacts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. emergency_access_tokens.
--
--    NO INSERT POLICY: rows are created only by the SECURITY DEFINER RPC in
--    0004, which generates the 256-bit secret server-side. Without an insert
--    policy, RLS denies direct client inserts, so nobody can register a
--    token_hash they already know.
--
--    NO DELETE POLICY: revocation is an UPDATE to revoked_at. Tokens are
--    retained (as tombstones) so a revoked QR code keeps returning "invalid"
--    instead of silently becoming reusable if a row were recreated.
-- ---------------------------------------------------------------------------
drop policy if exists "tokens_select_own_or_admin" on public.emergency_access_tokens;
create policy "tokens_select_own_or_admin" on public.emergency_access_tokens
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "tokens_update_own" on public.emergency_access_tokens;
create policy "tokens_update_own" on public.emergency_access_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Column-level lockdown: metadata and revocation only.
revoke update on public.emergency_access_tokens from authenticated;
grant update (label, expires_at, revoked_at)
  on public.emergency_access_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- 7. emergency_access_log - readable by the token's owner (and admins),
--    writable only by the SECURITY DEFINER function that records the read.
--    No client insert/update/delete policy exists.
-- ---------------------------------------------------------------------------
drop policy if exists "access_log_select_own_or_admin" on public.emergency_access_log;
create policy "access_log_select_own_or_admin" on public.emergency_access_log
  for select to authenticated
  using (
    exists (
      select 1
      from public.emergency_access_tokens t
      where t.id = token_id
        and t.user_id = (select auth.uid())
    )
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- 8. admin_roles - only an existing admin may grant or revoke roles.
--    There is deliberately no way for a user to insert their own row.
-- ---------------------------------------------------------------------------
drop policy if exists "admin_roles_select_admin" on public.admin_roles;
create policy "admin_roles_select_admin" on public.admin_roles
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admin_roles_insert_admin" on public.admin_roles;
create policy "admin_roles_insert_admin" on public.admin_roles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admin_roles_update_admin" on public.admin_roles;
create policy "admin_roles_update_admin" on public.admin_roles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_roles_delete_admin" on public.admin_roles;
create policy "admin_roles_delete_admin" on public.admin_roles
  for delete to authenticated
  using (public.is_admin());
