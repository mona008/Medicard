-- ============================================================================
-- 20261024000005_backfill_profiles.sql
-- MediCard: give EXISTING user accounts their profile rows.
--
-- IMPACT (read before applying):
--   * Inserts rows into public.profiles and public.medical_profiles for
--     accounts that already exist in auth.users.
--   * Purely additive: ON CONFLICT DO NOTHING means existing rows - including
--     any you created by hand - are never overwritten or deleted.
--   * Does not touch auth.users, passwords, sessions, or email addresses.
--   * Safe to re-run any number of times.
--   * Needed because the trigger in 0002 only fires for accounts created
--     AFTER it is installed.
-- ============================================================================

insert into public.profiles (id, display_name)
select u.id,
       left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 120)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

insert into public.medical_profiles (user_id)
select u.id
from auth.users u
where not exists (
  select 1 from public.medical_profiles m where m.user_id = u.id
)
on conflict (user_id) do nothing;
