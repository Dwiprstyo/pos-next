import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { StockClient } from "./stock-client";

export const dynamic = "force-dynamic";

export default async function AdminStockPage({
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

  const [ingredientsResult, transactionsResult] = await Promise.all([
    outletId
      ? supabase
          .from("ingredients")
          .select("id, name, unit, current_stock, min_stock_alert")
          .eq("outlet_id", outletId)
          .order("name")
      : Promise.resolve({ data: [] as never[] }),
    outletId
      ? supabase
          .from("stock_transactions")
          .select("id, qty_change, reason, created_at, ingredients!inner(name, unit, outlet_id)")
          .filter("ingredients.outlet_id", "eq", outletId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const activeOutlet = (outletList ?? []).find((outlet) => outlet.id === outletId);

  return (
    <StockClient
      ingredients={ingredientsResult.data ?? []}
      transactions={transactionsResult.data ?? []}
      outlets={outletList ?? []}
      outletId={outletId}
      isMultiOutlet={session.isMultiOutlet}
      outletName={activeOutlet?.name ?? session.outletName ?? "Outlet"}
    />
  );
}
