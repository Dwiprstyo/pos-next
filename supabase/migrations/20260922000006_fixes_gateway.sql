-- ============================================================
-- Fixes & gateway settlement RPC
-- ============================================================

-- Owners (is_multi_outlet) have outlet_id = null; they must still pass outlet checks.
create or replace function public.can_access_outlet(p_outlet_id uuid)
returns boolean
language sql
stable
as $$
  select public.jwt_is_multi_outlet()
      or (p_outlet_id is not null and p_outlet_id = public.jwt_outlet_id())
$$;

-- Payment gateway callback (webhook) settlement. service_role only.
create or replace function public.settle_gateway_payment(
  p_order_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference_no text,
  p_gateway_response jsonb default null
) returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;

  -- idempotent replay protection on gateway reference
  if p_reference_no is not null and exists (
    select 1 from public.payments where reference_no = p_reference_no
  ) then
    return v_order;
  end if;

  if v_order.status <> 'open' then
    return v_order;
  end if;

  insert into public.payments (order_id, method, amount, reference_no, gateway_response)
  values (p_order_id, p_method, p_amount, p_reference_no, p_gateway_response);

  if p_amount >= v_order.total - 0.005 then
    update public.orders
       set status = 'paid', paid_at = now()
     where id = v_order.id
     returning * into v_order;

    update public.dining_tables
       set status = 'empty', current_order_id = null
     where current_order_id = v_order.id;

    perform public._audit(null, v_order.outlet_id, 'order.pay.webhook', 'orders', v_order.id,
                          jsonb_build_object('reference_no', p_reference_no, 'amount', p_amount));
  end if;

  return v_order;
end;
$$;

revoke execute on function public.settle_gateway_payment(uuid, public.payment_method, numeric, text, jsonb)
  from anon, authenticated, public;
grant execute on function public.settle_gateway_payment(uuid, public.payment_method, numeric, text, jsonb)
  to service_role;
