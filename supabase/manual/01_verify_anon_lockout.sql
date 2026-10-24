-- ============================================================================
-- 01_verify_anon_lockout.sql  --  MANUAL VERIFICATION, NOT A MIGRATION
-- ============================================================================
-- Proves the `anon` role (what an unauthenticated visitor holds) cannot reach
-- any patient table, and can only call read_emergency_card().
--
-- Run in the Supabase SQL Editor AFTER migrations 0001-0005.
-- Every check prints PASS or raises FAIL. No data is written or deleted.
-- ============================================================================

begin;
set local role anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'medical_profiles', 'allergies', 'medications', 'conditions',
    'emergency_contacts', 'emergency_access_tokens', 'emergency_access_log',
    'admin_roles'
  ]
  loop
    begin
      execute format('select count(*) from public.%I;', t);
      raise exception 'FAIL: anon can READ public.%', t;
    exception
      when insufficient_privilege then
        raise notice 'PASS: anon denied read on public.%', t;
    end;
  end loop;
end $$;

commit;

-- ------------------------------------------------------------------------------
-- The one anonymous entry point must be executable, and must return NULL for a
-- token that does not exist (it must NOT error - an error would let an attacker
-- distinguish "malformed" from "revoked").
-- ------------------------------------------------------------------------------
begin;
set local role anon;

do $$
declare
  v jsonb;
begin
  v := public.read_emergency_card('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  if v is not null then
    raise exception 'FAIL: unknown token returned data';
  end if;
  raise notice 'PASS: unknown token returns null (no data, no error)';
end $$;

commit;

-- ------------------------------------------------------------------------------
-- anon must NOT be able to mint a token (that is what stops an attacker from
-- registering a token_hash they already know, e.g. SHA-256 of "1234").
-- ------------------------------------------------------------------------------
begin;
set local role anon;

do $$
begin
  begin
    perform public.create_emergency_access_token('attack');
    raise exception 'FAIL: anon can mint emergency tokens';
  exception
    when insufficient_privilege then
      raise notice 'PASS: anon cannot mint emergency tokens';
  end;
end $$;

commit;
