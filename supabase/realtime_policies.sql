-- Realtime authorization for the private KDS channel.
-- Run as a superuser (locally: `npm run db:setup`, which uses supabase_admin).
-- Idempotent.

-- RLS is enabled by default on hosted Supabase; enabling it again needs table
-- ownership, so it is attempted best-effort.
do $$
begin
  alter table realtime.messages enable row level security;
exception
  when insufficient_privilege then
    raise notice 'Skipping alter table realtime.messages (already managed by Supabase).';
end
$$;

drop policy if exists kds_receive_outlet_broadcast on realtime.messages;
create policy kds_receive_outlet_broadcast on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'kds:' || (auth.jwt() ->> 'outlet_id')
);

drop policy if exists kds_send_outlet_broadcast on realtime.messages;
create policy kds_send_outlet_broadcast on realtime.messages
for insert to authenticated
with check (
  extension = 'broadcast'
  and realtime.topic() = 'kds:' || (auth.jwt() ->> 'outlet_id')
);

-- Let the migration role manage these policies on subsequent local db resets.
-- On hosted Supabase this grant is unnecessary (and reserved-role protected),
-- so it is attempted best-effort only.
do $$
begin
  grant supabase_realtime_admin to postgres;
exception
  when insufficient_privilege then
    raise notice 'Skipping grant supabase_realtime_admin to postgres (hosted project).';
end
$$;
