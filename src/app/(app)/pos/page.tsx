import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import type { CartLine, MenuCategory, MenuItem } from "@/lib/pos-types";
import { createClient } from "@/lib/supabase/server";

import { PosClient } from "./pos-client";

export const dynamic = "force-dynamic";

type VariantRow = {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  variant_options: { id: string; name: string; extra_price: number }[];
};

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; order?: string }>;
}) {
  const session = await requireRole(["cashier", "manager"]);
  const params = await searchParams;

  if (!session.outletId) redirect("/admin/reports");

  const supabase = await createClient();

  const [categoriesResult, itemsResult, tablesResult, shiftResult, outletResult] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, station, sort_order")
      .eq("outlet_id", session.outletId)
      .order("sort_order"),
    supabase
      .from("menu_items")
      .select(
        "id, name, base_price, category_id, is_available, menu_categories(station), variant_groups(id, name, is_required, min_select, max_select, variant_options(id, name, extra_price))",
      )
      .eq("outlet_id", session.outletId)
      .eq("is_available", true)
      .order("name"),
    supabase
      .from("dining_tables")
      .select("id, label, status, current_order_id")
      .eq("outlet_id", session.outletId)
      .order("label"),
    supabase
      .from("shifts")
      .select("id, opened_at, opening_cash")
      .eq("staff_id", session.staffId)
      .is("closed_at", null)
      .maybeSingle(),
    supabase
      .from("outlets")
      .select("id, name, tax_percent, service_charge_percent, discount_approval_threshold")
      .eq("id", session.outletId)
      .single(),
  ]);

  if (!shiftResult.data) redirect("/pos/shift");

  const items: MenuItem[] = (itemsResult.data ?? []).map((item) => {
    const category = Array.isArray(item.menu_categories) ? item.menu_categories[0] : item.menu_categories;
    const groups = ((item.variant_groups ?? []) as VariantRow[]).map((group) => ({
      id: group.id,
      name: group.name,
      is_required: group.is_required,
      min_select: group.min_select,
      max_select: group.max_select,
      options: (group.variant_options ?? []).map((option) => ({
        id: option.id,
        name: option.name,
        extra_price: Number(option.extra_price),
      })),
    }));

    return {
      id: item.id,
      name: item.name,
      base_price: Number(item.base_price),
      category_id: item.category_id,
      is_available: item.is_available,
      station: category?.station ?? "kitchen",
      variant_groups: groups,
    };
  });

  const categories: MenuCategory[] = (categoriesResult.data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    station: category.station,
    sort_order: category.sort_order,
  }));

  let initialLines: CartLine[] = [];
  let appendOrder: { id: string; order_number: number; order_type: "dine_in" | "takeaway"; table_id: string | null } | null =
    null;

  if (params.order) {
    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, order_number, order_type, table_id, status, order_items(id, menu_item_id, menu_name, qty, notes, unit_price, station, order_item_variants(variant_option_id, variant_name, extra_price))",
      )
      .eq("id", params.order)
      .maybeSingle();

    if (order && order.status === "open") {
      appendOrder = {
        id: order.id,
        order_number: order.order_number,
        order_type: order.order_type,
        table_id: order.table_id,
      };

      initialLines = (order.order_items ?? []).map((item) => ({
        key: item.id,
        menuItemId: item.menu_item_id,
        name: item.menu_name,
        basePrice: Number(item.unit_price) -
          (item.order_item_variants ?? []).reduce((sum, variant) => sum + Number(variant.extra_price), 0),
        station: item.station,
        qty: item.qty,
        notes: item.notes ?? "",
        variants: (item.order_item_variants ?? []).map((variant) => ({
          optionId: variant.variant_option_id,
          groupName: "",
          name: variant.variant_name,
          extraPrice: Number(variant.extra_price),
        })),
      }));
    }
  }

  const outletConfig = outletResult.data ?? {
    id: session.outletId,
    name: session.outletName ?? "",
    tax_percent: 0,
    service_charge_percent: 0,
    discount_approval_threshold: 0,
  };

  return (
    <PosClient
      categories={categories}
      items={items}
      tables={tablesResult.data ?? []}
      outlet={outletConfig}
      initialTableId={params.table ?? null}
      appendOrder={appendOrder}
      initialLines={initialLines}
    />
  );
}
