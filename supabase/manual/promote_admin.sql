-- ============================================================================
-- promote_admin.sql  --  MANUAL SCRIPT, NOT A MIGRATION. DO NOT AUTO-RUN.
-- ============================================================================
-- Run this ONCE, by hand, after you have signed up through the app and know
-- the user id you want as administrator.
--
-- WHY IT IS MANUAL
--   RLS has no policy that lets a user insert their own admin_roles row, so
--   there is no way to "promote yourself" from inside the app. The first
--   administrator must be granted out-of-band by the project owner - the same
--   way you would hand out a root password. Every later grant is made by an
--   existing admin through the admin API.
--
-- HOW TO FIND THE USER ID
--   Supabase Dashboard -> Authentication -> Users -> copy the UUID,
--   or run:  select id, email from auth.users order by created_at desc;
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor, paste and edit the UUID, then Run.
-- ============================================================================

-- >>> EDIT THIS: replace with the real user id, including the quotes. <<<
-- (Plain literal on purpose: this script must run in the Supabase SQL Editor,
--  which does not understand psql's \\set variables.)

begin;

insert into public.admin_roles (user_id, role)
values ('REPLACE-WITH-USER-UUID'::uuid, 'admin')
on conflict (user_id) do update
  set role = excluded.role,
      granted_at = now();

commit;

-- Verify the grant landed:
select r.user_id, r.role, r.granted_at, u.email
from public.admin_roles r
join auth.users u on u.id = r.user_id;

-- To REVOKE an administrator (also manual - no admin can demote themselves
-- through a policy that would otherwise leave the system with no admin):
--   begin;
--   delete from public.admin_roles where user_id = 'REPLACE-WITH-USER-UUID'::uuid;
--   commit;
