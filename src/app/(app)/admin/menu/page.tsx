import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { MenuAdminClient } from "./menu-client";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const session = await requireRole(["manager"]);
  const params = await searchParams;
  const supabase = await createClient();

  const { data: outletList } = session.isMultiOutlet
    ? await supabase.from("outlets").select("id, name").eq("is_active", true).order("name")
    : { data: [] };

  const outletId = session.isMultiOutlet
    ? (params.outlet ?? outletList?.[0]?.id ?? null)
    : session.outletId;

  const [categoriesResult, itemsResult, ingredientsResult] = await Promise.all([
    outletId
      ? supabase
          .from("menu_categories")
          .select("id, name, station, sort_order")
          .eq("outlet_id", outletId)
          .order("sort_order")
      : Promise.resolve({ data: [] as never[] }),
    outletId
      ? supabase
          .from("menu_items")
          .select(
            "id, name, base_price, category_id, is_available, variant_groups(id, name, is_required, min_select, max_select, variant_options(id, name, extra_price)), menu_item_ingredients(ingredient_id, qty_required, ingredients(name, unit))",
          )
          .eq("outlet_id", outletId)
          .order("name")
      : Promise.resolve({ data: [] as never[] }),
    outletId
      ? supabase.from("ingredients").select("id, name, unit").eq("outlet_id", outletId).order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const activeOutlet = (outletList ?? []).find((outlet) => outlet.id === outletId);

  return (
    <MenuAdminClient
      categories={categoriesResult.data ?? []}
      items={itemsResult.data ?? []}
      ingredients={ingredientsResult.data ?? []}
      outlets={outletList ?? []}
      outletId={outletId}
      isMultiOutlet={session.isMultiOutlet}
      outletName={activeOutlet?.name ?? session.outletName ?? "Outlet"}
    />
  );
}
