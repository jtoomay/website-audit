-- Local-only seed data. Runs on `supabase start` (first time) and `supabase db reset`.
-- Creates two ready-to-use test accounts:
--   demo@example.com  / password123   (plan: pro)
--   demo2@example.com / password123   (plan: free; handy for checking users can't see each other's scans)

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'demo@example.com'),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'demo2@example.com')
    ) as t(id, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict do nothing;
  end loop;
end $$;

update public.profiles set plan = 'pro' where id = '11111111-1111-1111-1111-111111111111';
