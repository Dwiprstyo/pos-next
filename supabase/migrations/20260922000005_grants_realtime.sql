-- ============================================================
-- Function privileges & Realtime authorization
-- ============================================================

-- Auth hook
grant usage on schema public to supabase_auth_admin;
grant select on public.staff to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;

-- ── Internal helpers: not callable through the API ─────────
revoke execute on function public._audit(uuid, uuid, text, text, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.recompute_order_totals(uuid) from anon, authenticated, public;
revoke execute on function public.fill_order_item_denorm() from anon, authenticated, public;
revoke execute on function public.deduct_stock_on_payment() from anon, authenticated, public;
revoke execute on function public.broadcast_order_item_change() from anon, authenticated, public;
revoke execute on function public.broadcast_order_change() from anon, authenticated, public;

-- ── Privileged approval paths: service_role only ───────────
revoke execute on function public.apply_order_discount(uuid, text, numeric, uuid) from anon, authenticated, public;
grant execute on function public.apply_order_discount(uuid, text, numeric, uuid) to service_role;

revoke execute on function public.void_order(uuid, text, uuid) from anon, authenticated, public;
grant execute on function public.void_order(uuid, text, uuid) to service_role;

-- ── App RPCs: authenticated, role enforced inside ──────────
revoke execute on function public.create_order(uuid, uuid, public.order_type, jsonb) from anon, public;
grant execute on function public.create_order(uuid, uuid, public.order_type, jsonb) to authenticated;

revoke execute on function public.add_order_items(uuid, jsonb) from anon, public;
grant execute on function public.add_order_items(uuid, jsonb) to authenticated;

revoke execute on function public.apply_order_discount(uuid, text, numeric) from anon, public;
grant execute on function public.apply_order_discount(uuid, text, numeric) to authenticated;

revoke execute on function public.pay_order(uuid, jsonb, text) from anon, public;
grant execute on function public.pay_order(uuid, jsonb, text) to authenticated;

revoke execute on function public.void_order(uuid, text) from anon, public;
grant execute on function public.void_order(uuid, text) to authenticated;

revoke execute on function public.set_kitchen_status(uuid, public.kitchen_status) from anon, public;
grant execute on function public.set_kitchen_status(uuid, public.kitchen_status) to authenticated;

revoke execute on function public.open_shift(numeric) from anon, public;
grant execute on function public.open_shift(numeric) to authenticated;

revoke execute on function public.close_shift(uuid, numeric) from anon, public;
grant execute on function public.close_shift(uuid, numeric) to authenticated;

revoke execute on function public.adjust_stock(uuid, numeric, text) from anon, public;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;

revoke execute on function public.refresh_daily_sales_summary() from anon, public;
grant execute on function public.refresh_daily_sales_summary() to authenticated, service_role;

revoke execute on function public.daily_sales(date, date, uuid) from anon, public;
grant execute on function public.daily_sales(date, date, uuid) to authenticated;

revoke execute on function public.top_selling_items(date, date, uuid, int) from anon, public;
grant execute on function public.top_selling_items(date, date, uuid, int) to authenticated;

revoke execute on function public.shift_summary(uuid) from anon, public;
grant execute on function public.shift_summary(uuid) to authenticated;

-- ── Realtime: private KDS channel per outlet ───────────────
-- realtime.messages is owned by supabase_realtime_admin. On hosted Supabase the
-- `postgres` role can create policies on it; locally the migration may run
-- without that privilege, in which case supabase/realtime_policies.sql is
-- applied by `npm run db:setup` (see README).
do $do$
begin
  begin
    alter table realtime.messages enable row level security;

    create policy kds_receive_outlet_broadcast on realtime.messages
    for select to authenticated
    using (
      extension = 'broadcast'
      and realtime.topic() = 'kds:' || (auth.jwt() ->> 'outlet_id')
    );

    -- allow authenticated staff to publish on their own outlet topic (e.g. KDS ack pings)
    create policy kds_send_outlet_broadcast on realtime.messages
    for insert to authenticated
    with check (
      extension = 'broadcast'
      and realtime.topic() = 'kds:' || (auth.jwt() ->> 'outlet_id')
    );
  exception
    when insufficient_privilege then
      raise notice 'Skipping realtime.messages policies (insufficient privilege). Run supabase/realtime_policies.sql as a superuser.';
    when duplicate_object then
      null;
  end;
end
$do$;
