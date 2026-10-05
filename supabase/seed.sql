-- ============================================================
-- Seed data (local dev). PINs: owner 1111, manager 2222,
-- cashier 3333, cashier2 4444, kitchen 5555, kitchen2 6666
-- ============================================================

-- ── Outlets ────────────────────────────────────────────────
insert into public.outlets (id, name, address, tax_percent, service_charge_percent, discount_approval_threshold)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Warung Nusantara — Pusat', 'Jl. Merdeka No. 1, Jakarta', 10, 5, 50000),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Warung Nusantara — Cabang', 'Jl. Sudirman No. 88, Bandung', 10, 0, 25000)
on conflict (id) do nothing;

-- ── Auth users + staff ─────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'owner@outlet.internal',     null::uuid,                                  'OWN', 'Budi Owner',      'manager', true,  '$argon2id$v=19$m=19456,t=2,p=1$6dcbelUW6fMg/AacN+l6pQ$hc3MHQ4Fh29kTilmqwSLEv9nEmysLUdoQkp8zQEmqVc'),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'manager.pst@outlet.internal','aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'MGR', 'Sari Manager',    'manager', false, '$argon2id$v=19$m=19456,t=2,p=1$kV6GPOz3G61oyqjFR7Wcnw$0wr9SBlmaXz8UUJRpXtDnqqU/7PCm/zah+dOvT8kapw'),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'cashier1.pst@outlet.internal','aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'KSR1','Andi Kasir',      'cashier', false, '$argon2id$v=19$m=19456,t=2,p=1$lkFWCxf2c8+5s41xiaW3Ng$z45/Nq122i02P91Q4lTXirlQ+9cEQkwR4QF4suv/9dU'),
      ('44444444-4444-4444-4444-444444444444'::uuid, 'cashier2.cbg@outlet.internal','aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'KSR2','Rina Kasir',      'cashier', false, '$argon2id$v=19$m=19456,t=2,p=1$xUE9uzu0I2qPNNupD2j+8g$HobRL00gpKLqbmqLS5r4Trjl0i2yCM+0KFBMIs2z3ME'),
      ('55555555-5555-5555-5555-555555555555'::uuid, 'kitchen.pst@outlet.internal','aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'DAP','Joko Dapur',       'kitchen', false, '$argon2id$v=19$m=19456,t=2,p=1$ocmr2TzQVrgrg0RivnWl9w$DS1H96Nm+ULNRnpISWlnhotv0N2PomKrotl2OXRtCjU'),
      ('66666666-6666-6666-6666-666666666666'::uuid, 'kitchen2.cbg@outlet.internal','aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'DAP2','Tono Dapur',      'kitchen', false, '$argon2id$v=19$m=19456,t=2,p=1$i7rQewYR4eJfjkWR0bFYFg$Q82kgkC6NHXIEjJzjgX/XIXzI0/P9OmrtctM/GRYhXw')
    ) as t(user_id, email, outlet_id, staff_code, full_name, role, is_multi_outlet, pin_hash)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    )
    values (
      '00000000-0000-0000-0000-000000000000', r.user_id, 'authenticated', 'authenticated',
      r.email, crypt('local-dev-only', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '', '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
    )
    values (
      r.user_id::text, r.user_id,
      jsonb_build_object('sub', r.user_id::text, 'email', r.email, 'email_verified', true),
      'email', now(), now(), now(), gen_random_uuid()
    )
    on conflict (provider_id, provider) do nothing;

    insert into public.staff (id, user_id, outlet_id, staff_code, full_name, role, pin_hash, is_multi_outlet)
    values (r.user_id, r.user_id, r.outlet_id, r.staff_code, r.full_name, r.role::public.staff_role, r.pin_hash, r.is_multi_outlet)
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- ── Dining tables ──────────────────────────────────────────
insert into public.dining_tables (outlet_id, label)
select 'aaaaaaaa-0000-0000-0000-000000000001', 'T' || g
from generate_series(1, 8) g
on conflict (outlet_id, label) do nothing;

insert into public.dining_tables (outlet_id, label)
select 'aaaaaaaa-0000-0000-0000-000000000002', 'T' || g
from generate_series(1, 5) g
on conflict (outlet_id, label) do nothing;

-- ── Menu categories ────────────────────────────────────────
insert into public.menu_categories (id, outlet_id, name, station, sort_order) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Makanan', 'kitchen', 1),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Minuman', 'bar', 2),
  ('c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Snack', 'kitchen', 3),
  ('c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', 'Makanan', 'kitchen', 1),
  ('c0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002', 'Minuman', 'bar', 2)
on conflict (id) do nothing;

-- ── Menu items ─────────────────────────────────────────────
insert into public.menu_items (id, outlet_id, category_id, name, base_price, is_available) values
  ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Nasi Goreng Spesial', 35000, true),
  ('d0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Mie Goreng', 30000, true),
  ('d0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Ayam Geprek', 32000, true),
  ('d0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Es Teh Manis', 8000, true),
  ('d0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Kopi Susu', 18000, true),
  ('d0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Kentang Goreng', 20000, true),
  ('d0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Pisang Goreng', 15000, true),
  ('d0000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'Nasi Goreng Spesial', 33000, true),
  ('d0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000005', 'Es Teh Manis', 8000, true)
on conflict (id) do nothing;

-- ── Variant groups & options ───────────────────────────────
insert into public.variant_groups (id, menu_item_id, name, is_required, min_select, max_select) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Level Pedas', true, 1, 1),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'Level Pedas', true, 1, 1),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'Level Pedas', true, 1, 1),
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'Suhu', true, 1, 1),
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 'Suhu', true, 1, 1)
on conflict (id) do nothing;

insert into public.variant_options (id, variant_group_id, name, extra_price) values
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Tidak Pedas', 0),
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'Level 1', 0),
  ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'Level 2', 0),
  ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'Level 3', 2000),
  ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000002', 'Level 1', 0),
  ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000002', 'Level 2', 0),
  ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000002', 'Level 3', 2000),
  ('f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000003', 'Level 1', 0),
  ('f0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000003', 'Level 5', 3000),
  ('f0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000004', 'Es', 0),
  ('f0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000004', 'Panas', 0),
  ('f0000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-000000000005', 'Es', 0),
  ('f0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-000000000005', 'Panas', 0)
on conflict (id) do nothing;

-- ── Ingredients ────────────────────────────────────────────
insert into public.ingredients (id, outlet_id, name, unit, current_stock, min_stock_alert) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Beras', 'gram', 50000, 10000),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Telur', 'pcs', 120, 20),
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ayam', 'gram', 20000, 5000),
  ('a1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mie', 'gram', 10000, 2000),
  ('a1000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Minyak', 'ml', 20000, 3000),
  ('a1000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Gula', 'gram', 5000, 1000),
  ('a1000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Teh', 'gram', 2000, 500),
  ('a1000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Kopi', 'gram', 3000, 500),
  ('a1000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'Susu', 'ml', 10000, 2000),
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Kentang', 'gram', 10000, 2000),
  ('a1000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'Pisang', 'pcs', 50, 10)
on conflict (id) do nothing;

-- ── Recipes (menu item -> ingredients) ─────────────────────
insert into public.menu_item_ingredients (menu_item_id, ingredient_id, qty_required) values
  ('d0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 200),
  ('d0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 1),
  ('d0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 15),
  ('d0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', 150),
  ('d0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 1),
  ('d0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 15),
  ('d0000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 200),
  ('d0000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 200),
  ('d0000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005', 20),
  ('d0000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000007', 10),
  ('d0000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000006', 20),
  ('d0000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000008', 15),
  ('d0000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000009', 150),
  ('d0000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000006', 15),
  ('d0000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-00000000000a', 200),
  ('d0000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000005', 20),
  ('d0000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-00000000000b', 1),
  ('d0000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000005', 20)
on conflict do nothing;
