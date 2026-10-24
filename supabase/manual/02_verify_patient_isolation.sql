-- ============================================================================
-- 02_verify_patient_isolation.sql  --  MANUAL VERIFICATION, NOT A MIGRATION
-- ============================================================================
-- Proves patient A cannot see, change, or forge anything belonging to patient B.
--
-- PREREQUISITE
--   1. Create TWO test accounts through the app.
--   2. Add at least one allergy / medication / contact to EACH account.
--      Use SYNTHETIC data only - never real patient information.
--   3. Replace the two UUIDs below with those accounts' user ids.
--      (Dashboard -> Authentication -> Users, or: select id from auth.users;)
--
-- Every check prints PASS or raises FAIL. Nothing outside the fixtures is
-- modified; the tokens created here belong to throwaway test accounts.
-- ============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1 - patient B mints a QR token. Confirms the RPC works and that B owns it.
-- ------------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub": "REPLACE-WITH-USER-B-UUID", "role": "authenticated"}';

do $$
declare
  v_token text;
begin
  v_token := public.create_emergency_access_token('B test card', 30);
  if v_token is null or length(v_token) <> 64 then
    raise exception 'FAIL: create_emergency_access_token did not return a 64-char token';
  end if;
  raise notice 'PASS: patient B minted a token (%)', left(v_token, 8) || '...';
end $$;

commit;

-- ------------------------------------------------------------------------------
-- STEP 2 - patient A mints one too, then probes for B's data.
-- ------------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub": "REPLACE-WITH-USER-A-UUID", "role": "authenticated"}';

do $$
declare
  v_a uuid := 'REPLACE-WITH-USER-A-UUID'::uuid;
  v_b uuid := 'REPLACE-WITH-USER-B-UUID'::uuid;
  v_token text;
  v_leak text := '';
  t text;
begin
  v_token := public.create_emergency_access_token('A test card', null);
  if v_token is null or length(v_token) <> 64 then
    raise exception 'FAIL: patient A could not mint a token';
  end if;

  -- Positive control: the filters below are only meaningful if A can still
  -- see their OWN rows.
  if (select count(*) from public.allergies where user_id = v_a) = 0 then
    raise exception 'FAIL: user A cannot see their own allergies - policy or fixture problem';
  end if;
  raise notice 'PASS: user A sees their own allergy rows (positive control)';

  -- A must never see a row owned by B, on any patient table.
  foreach t in array array[
    'medical_profiles', 'allergies', 'medications',
    'conditions', 'emergency_contacts'
  ]
  loop
    execute format(
      'select string_agg(%I::text, '','') from public.%I where user_id = %L::uuid',
      (select case when t = 'medical_profiles' then 'user_id' else 'id' end),
      t, v_b
    ) into v_leak;

    if coalesce(v_leak, '') <> '' then
      raise exception 'FAIL: user A can see user B rows in public.% (%)', t, v_leak;
    end if;

    raise notice 'PASS: user A sees no user B rows in public.%', t;
  end loop;

  -- Token isolation, with the positive control that matters: A sees exactly
  -- their own token and none of B's.
  if (select count(*) from public.emergency_access_tokens where user_id = v_a) <> 1 then
    raise exception 'FAIL: user A cannot see exactly their own token';
  end if;
  if (select count(*) from public.emergency_access_tokens where user_id = v_b) <> 0 then
    raise exception 'FAIL: user A can see user B emergency tokens';
  end if;
  raise notice 'PASS: user A sees own tokens only, none of user B';

  -- A must not be able to write a row that claims to belong to B.
  begin
    insert into public.allergies (user_id, name)
    values (v_b, 'synthetic-cross-account-write');
    raise exception 'FAIL: user A inserted a row owned by user B';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'PASS: user A cannot write into user B record';
  end;
end $$;

commit;

-- ------------------------------------------------------------------------------
-- STEP 3 - token integrity. A client must not be able to choose its own
-- token_hash, overwrite it, or delete the revocation tombstone.
-- ------------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub": "REPLACE-WITH-USER-A-UUID", "role": "authenticated"}';

do $$
declare
  v_after integer;
begin
  -- Registering a hash the client already knows (SHA-256 of "1234") would
  -- downgrade the QR code to a guessable value.
  begin
    insert into public.emergency_access_tokens (user_id, token_hash)
    values ('REPLACE-WITH-USER-A-UUID'::uuid, repeat('a', 64));
    raise exception 'FAIL: client can insert its own token_hash';
  exception
    when insufficient_privilege then
      raise notice 'PASS: clients cannot insert token rows directly';
  end;

  -- Column-level grant: token_hash is not client-writable.
  begin
    update public.emergency_access_tokens set token_hash = repeat('b', 64);
    raise exception 'FAIL: client can overwrite token_hash';
  exception
    when insufficient_privilege then
      raise notice 'PASS: token_hash is not client-writable (column grant)';
  end;

  -- RLS filters silently for DELETE rather than raising, so assert on the
  -- row count instead of expecting an error.
  delete from public.emergency_access_tokens;
  get diagnostics v_after = row_count;
  if v_after > 0 then
    raise exception 'FAIL: client deleted % token row(s)', v_after;
  end if;
  if (select count(*) from public.emergency_access_tokens
      where user_id = 'REPLACE-WITH-USER-A-UUID'::uuid) = 0 then
    raise exception 'FAIL: token rows vanished; revocation could be undone by deletion';
  end if;
  raise notice 'PASS: tokens cannot be deleted, only revoked';

  -- Revocation itself must still work - a guard that blocks revocation would
  -- be its own vulnerability.
  update public.emergency_access_tokens
     set revoked_at = now()
   where user_id = 'REPLACE-WITH-USER-A-UUID'::uuid;
  get diagnostics v_after = row_count;
  if v_after <> 1 then
    raise exception 'FAIL: owner could not revoke their own token (rows=%)', v_after;
  end if;
  raise notice 'PASS: owner can revoke their own token';
end $$;

commit;
