-- ============================================================================
-- 20261024000004_emergency_access.sql
-- MediCard: revocable, opaque QR access tokens.
--
-- IMPACT (read before applying):
--   * Creates two new functions:
--       public.create_emergency_access_token(label, expires_in_days) -> text
--       public.read_emergency_card(token)                           -> jsonb
--   * Creates no tables and alters no existing object.
--   * Revocation itself is a plain UPDATE by the owner (RLS from 0003);
--     no extra function is needed for it.
--   * Grants EXECUTE on read_emergency_card() to `anon`. That is the single
--     anonymous entry point to patient data in the whole schema.
--
-- TOKEN DESIGN
--   * 32 random bytes from pgcrypto  ->  64 hex chars  ->  256 bits of entropy.
--   * Generated inside the SECURITY DEFINER function and returned exactly
--     ONCE. Only SHA-256(hex) is persisted, so a database dump cannot be
--     replayed as a working QR code.
--   * Opaque: it encodes no patient data, no user id, no sequence number.
--     Reading the URL tells an attacker nothing about the patient.
--   * Revocable: revoked_at / expires_at are checked on EVERY read, so a
--     revoked QR code stops working on the next request - no cache, no TTL.
--
-- KNOWN LIMITATIONS (see supabase/README.md)
--   * No per-IP rate limiting at the database layer. Supabase's API gateway
--     rate limits apply; 256-bit entropy makes online guessing infeasible
--     regardless.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Create a token. Returns the plaintext ONCE; never store it.
-- Callable only by the signed-in owner (auth.uid() must be present).
-- ---------------------------------------------------------------------------
create or replace function public.create_emergency_access_token(
  p_label text default 'Emergency card',
  p_expires_in_days integer default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plaintext text;
  v_hash text;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if p_expires_in_days is not null
     and (p_expires_in_days < 1 or p_expires_in_days > 3650) then
    raise exception 'Expiry must be between 1 and 3650 days.';
  end if;

  -- 32 bytes of CSPRNG entropy, hex encoded. Never log or persist this value.
  v_plaintext := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_plaintext, 'sha256'), 'hex');

  insert into public.emergency_access_tokens (user_id, token_hash, label, expires_at)
  values (
    v_user,
    v_hash,
    left(coalesce(nullif(trim(p_label), ''), 'Emergency card'), 80),
    case
      when p_expires_in_days is null then null
      else now() + make_interval(days => p_expires_in_days)
    end
  );

  return v_plaintext;
end;
$$;

-- The owner of a token may revoke it with a normal UPDATE (RLS policy
-- "tokens_update_own"). Revoke-on-read is enforced inside read_emergency_card.

-- ---------------------------------------------------------------------------
-- Read an emergency card by token. This is what the public /e/:token page
-- calls. Returns NULL (not an error) for unknown, expired or revoked tokens
-- so the endpoint cannot be used to distinguish them.
-- ---------------------------------------------------------------------------
create or replace function public.read_emergency_card(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_token_id uuid;
  v_user uuid;
  v_profile public.profiles%rowtype;
  v_med public.medical_profiles%rowtype;
begin
  -- Bound the input before touching an index: rejects junk without a lookup.
  if p_token is null or length(p_token) not between 32 and 128 then
    return null;
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select t.id, t.user_id
    into v_token_id, v_user
    from public.emergency_access_tokens t
   where t.token_hash = v_hash
     and t.revoked_at is null
     and (t.expires_at is null or t.expires_at > now());

  if v_token_id is null then
    return null;
  end if;

  -- Audit first: a read must be recorded even if the patient record is sparse.
  insert into public.emergency_access_log (token_id) values (v_token_id);

  update public.emergency_access_tokens
     set access_count = access_count + 1,
         last_accessed_at = now()
   where id = v_token_id;

  select * into v_profile from public.profiles p where p.id = v_user;
  select * into v_med from public.medical_profiles m where m.user_id = v_user;

  return jsonb_build_object(
    'cardholder_name', coalesce(nullif(v_profile.display_name, ''), 'Unknown patient'),
    'date_of_birth', to_char(v_med.date_of_birth, 'YYYY-MM-DD'),
    'blood_type', coalesce(v_med.blood_type, 'Unknown'),
    'height_cm', v_med.height_cm,
    'weight_kg', v_med.weight_kg,
    'physician_name', v_med.physician_name,
    'physician_phone', v_med.physician_phone,
    'notes', v_med.notes,
    'allergies', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', a.name,
            'severity', a.severity,
            'reaction', a.reaction,
            'notes', a.notes
          )
          order by case a.severity
                     when 'life-threatening' then 0
                     when 'severe' then 1
                     when 'moderate' then 2
                     else 3
                   end,
                   a.name
        ),
        '[]'::jsonb
      )
      from public.allergies a
      where a.user_id = v_user
    ),
    'medications', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', m.name,
            'dosage', m.dosage,
            'frequency', m.frequency,
            'prescriber', m.prescriber
          )
          order by m.name
        ),
        '[]'::jsonb
      )
      from public.medications m
      where m.user_id = v_user
    ),
    'conditions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', c.name,
            'status', c.status,
            'diagnosed_on', to_char(c.diagnosed_on, 'YYYY-MM-DD'),
            'notes', c.notes
          )
          order by case c.status
                     when 'active' then 0
                     when 'managed' then 1
                     else 2
                   end,
                   c.name
        ),
        '[]'::jsonb
      )
      from public.conditions c
      where c.user_id = v_user
    ),
    'emergency_contacts', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', e.name,
            'relationship', e.relationship,
            'phone', e.phone,
            'secondary_phone', e.secondary_phone,
            'is_primary', e.is_primary
          )
          order by e.is_primary desc, e.name
        ),
        '[]'::jsonb
      )
      from public.emergency_contacts e
      where e.user_id = v_user
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges.
--   create_* : owner only (must never be reachable anonymously).
--   read_*   : anonymous callers MAY execute it, but only a valid token
--              returns data; every other call yields NULL.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_emergency_access_token(text, integer)
  from public, anon;
grant execute on function public.create_emergency_access_token(text, integer)
  to authenticated;

revoke execute on function public.read_emergency_card(text) from public;
grant execute on function public.read_emergency_card(text)
  to anon, authenticated;
