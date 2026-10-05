import { BarChart3, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { addDaysISO, formatDateTime, rupiah, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { ReportControls } from "./report-controls";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; outlet?: string }>;
}) {
  const session = await requireRole(["manager"]);
  const params = await searchParams;

  const today = todayISO();
  const from = params.from ?? `${today.slice(0, 7)}-01`;
  const to = params.to ?? today;
  const outletFilter = session.isMultiOutlet ? (params.outlet ?? undefined) : session.outletId ?? undefined;

  const supabase = await createClient();

  const [salesResult, topResult, outletsResult, recentResult] = await Promise.all([
    supabase.rpc("daily_sales", {
      p_from: from,
      p_to: to,
      p_outlet_id: outletFilter ?? undefined,
    }),
    supabase.rpc("top_selling_items", {
      p_from: from,
      p_to: to,
      p_outlet_id: outletFilter ?? undefined,
      p_limit: 10,
    }),
    session.isMultiOutlet
      ? supabase.from("outlets").select("id, name").eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase
      .from("orders")
      .select("id, order_number, total, status, created_at, paid_at, outlets(name)")
      .gte("created_at", `${from}T00:00:00+07:00`)
      .lte("created_at", `${addDaysISO(to, 1)}T00:00:00+07:00`)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const sales = salesResult.data ?? [];
  const totals = sales.reduce(
    (acc, row) => ({
      orders: acc.orders + Number(row.orders_count),
      gross: acc.gross + Number(row.gross_sales),
      discount: acc.discount + Number(row.discount_total),
      tax: acc.tax + Number(row.tax_total),
      net: acc.net + Number(row.net_sales),
      cash: acc.cash + Number(row.cash_sales),
      nonCash: acc.nonCash + Number(row.non_cash_sales),
    }),
    { orders: 0, gross: 0, discount: 0, tax: 0, net: 0, cash: 0, nonCash: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Laporan Penjualan</h1>
          <p className="text-sm text-muted-foreground">
            {from} s/d {to} • {session.outletName ?? "Semua outlet"}
          </p>
        </div>
        <ReportControls
          from={from}
          to={to}
          outlets={outletsResult.data ?? []}
          outletFilter={outletFilter}
          isMultiOutlet={session.isMultiOutlet}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Omzet (net)" value={rupiah(totals.net)} icon={<TrendingUp className="size-4" />} />
        <SummaryCard title="Jumlah pesanan" value={String(totals.orders)} icon={<BarChart3 className="size-4" />} />
        <SummaryCard title="Tunai" value={rupiah(totals.cash)} />
        <SummaryCard title="Non-tunai" value={rupiah(totals.nonCash)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omzet Harian</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead className="text-right">Pesanan</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Diskon</TableHead>
                <TableHead className="text-right">Pajak</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((row) => (
                <TableRow key={`${row.outlet_id}-${row.sale_date}`}>
                  <TableCell>{row.sale_date}</TableCell>
                  <TableCell>{row.outlet_name}</TableCell>
                  <TableCell className="text-right">{row.orders_count}</TableCell>
                  <TableCell className="text-right">{rupiah(row.gross_sales)}</TableCell>
                  <TableCell className="text-right">{rupiah(row.discount_total)}</TableCell>
                  <TableCell className="text-right">{rupiah(row.tax_total)}</TableCell>
                  <TableCell className="text-right font-medium">{rupiah(row.net_sales)}</TableCell>
                </TableRow>
              ))}
              {sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Belum ada penjualan pada periode ini.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Menu Terlaris</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Menu</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Omzet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(topResult.data ?? []).map((row) => (
                  <TableRow key={row.menu_item_id}>
                    <TableCell>{row.menu_name}</TableCell>
                    <TableCell className="text-right">{row.qty_sold}</TableCell>
                    <TableCell className="text-right">{rupiah(row.revenue)}</TableCell>
                  </TableRow>
                ))}
                {(topResult.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Tidak ada data.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recentResult.data ?? []).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{order.order_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                    <TableCell>{order.status}</TableCell>
                    <TableCell className="text-right">{rupiah(order.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {title}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
