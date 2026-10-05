import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { isMidtransConfigured } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";

import { CheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await requireRole(["cashier", "manager"]);
  const params = await searchParams;

  if (!session.outletId) redirect("/admin/reports");
  if (!params.order) redirect("/pos");

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, subtotal, discount_amount, discount_type, discount_value, tax_amount, total, table_id, dining_tables!orders_table_id_fkey(label), order_items(id, menu_name, qty, unit_price, notes, order_item_variants(variant_name, extra_price))",
    )
    .eq("id", params.order)
    .maybeSingle();

  if (!order || order.status !== "open") redirect("/pos");

  const { data: outlet } = await supabase
    .from("outlets")
    .select("id, name, tax_percent, service_charge_percent, discount_approval_threshold")
    .eq("id", session.outletId)
    .single();

  const table = Array.isArray(order.dining_tables) ? order.dining_tables[0] : order.dining_tables;

  return (
    <CheckoutClient
      order={{
        id: order.id,
        order_number: order.order_number,
        order_type: order.order_type,
        table_label: table?.label ?? null,
        subtotal: Number(order.subtotal),
        discount_amount: Number(order.discount_amount),
        discount_type: order.discount_type,
        discount_value: order.discount_value === null ? null : Number(order.discount_value),
        tax_amount: Number(order.tax_amount),
        total: Number(order.total),
        items: (order.order_items ?? []).map((item) => ({
          id: item.id,
          name: item.menu_name,
          qty: item.qty,
          unit_price: Number(item.unit_price),
          notes: item.notes,
          variants: (item.order_item_variants ?? []).map((variant) => variant.variant_name),
        })),
      }}
      outlet={
        outlet ?? {
          id: session.outletId,
          name: session.outletName ?? "",
          tax_percent: 0,
          service_charge_percent: 0,
          discount_approval_threshold: 0,
        }
      }
      role={session.role as "cashier" | "manager"}
      gatewayEnabled={isMidtransConfigured()}
    />
  );
}
