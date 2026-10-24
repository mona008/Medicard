-- ============================================================================
-- 20261024000002_profile_bootstrap.sql
-- MediCard: create a patient's rows when their auth account is created.
--
-- IMPACT (read before applying):
--   * Creates the function public.handle_new_user().
--   * Adds ONE trigger to auth.users (insert only), guarded by a DO block so
--     it is skipped if it already exists.
--   * The trigger INSERTs into public.profiles and public.medical_profiles
--     with ON CONFLICT DO NOTHING, so it never overwrites existing rows and
--     never fails an existing signup.
--   * Runs with SECURITY DEFINER because the `authenticated` role cannot
--     write to auth.users itself.
--   * Existing user accounts are unaffected: a trigger only fires on future
--     inserts. Backfill for current users is in 0005.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  )
  on conflict (id) do nothing;

  insert into public.medical_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Only the migration owner may execute this directly; it fires via the trigger.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row
      execute function public.handle_new_user();
  end if;
end $$;
