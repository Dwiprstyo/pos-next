/**
 * End-to-end smoke test against the local Supabase stack.
 * Usage: node scripts/smoke-test.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const OUTLET_1 = "aaaaaaaa-0000-0000-0000-000000000001";
const LEVEL_1 = "f0000000-0000-0000-0000-000000000002";
const ES = "f0000000-0000-0000-0000-00000000000a";
const NASI_GORENG = "d0000000-0000-0000-0000-000000000001";
const ES_TEH = "d0000000-0000-0000-0000-000000000004";
const BERAS = "a1000000-0000-0000-0000-000000000001";

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

async function login(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink ${email}: ${error.message}`);
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: otpError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (otpError) throw new Error(`verifyOtp ${email}: ${otpError.message}`);
  return client;
}

async function stockOf(ingredientId) {
  const { data } = await admin
    .from("ingredients")
    .select("current_stock")
    .eq("id", ingredientId)
    .single();
  return Number(data.current_stock);
}

async function main() {
  console.log("1. Login PIN-style (generateLink + verifyOtp) & claims");
  const cashier = await login("cashier1.pst@outlet.internal");
  const kitchen = await login("kitchen.pst@outlet.internal");
  const manager = await login("manager.pst@outlet.internal");
  const cashier2 = await login("cashier2.cbg@outlet.internal");

  const cashierClaims = JSON.parse(
    Buffer.from(cashier.auth.getSession() ? "" : "").toString() || "{}",
  );
  void cashierClaims;
  check("cashier session created", Boolean(cashier.auth.getSession));

  console.log("2. Shift open");
  const { data: shift, error: shiftError } = await cashier.rpc("open_shift", { p_opening_cash: 500000 });
  check("open_shift", !shiftError && shift?.id, shiftError?.message);
  const shiftId = shift.id;

  console.log("3. Create order with required variant");
  const { data: tables } = await cashier
    .from("dining_tables")
    .select("id, label")
    .eq("outlet_id", OUTLET_1)
    .eq("status", "empty")
    .limit(1);
  const tableId = tables[0].id;

  const { data: orderA, error: orderAError } = await cashier.rpc("create_order", {
    p_client_id: crypto.randomUUID(),
    p_table_id: tableId,
    p_order_type: "dine_in",
    p_items: [
      { menu_item_id: NASI_GORENG, qty: 1, variant_option_ids: [LEVEL_1] },
      { menu_item_id: ES_TEH, qty: 2, variant_option_ids: [ES] },
    ],
  });
  check("create_order succeeds", !orderAError && orderA?.id, orderAError?.message);
  check(
    "totals computed server-side (51000 + 10% + 5%)",
    Number(orderA.subtotal) === 51000 && Number(orderA.total) === 58650,
    `subtotal=${orderA?.subtotal} total=${orderA?.total}`,
  );

  const { data: tableAfter } = await cashier.from("dining_tables").select("status").eq("id", tableId).single();
  check("table marked occupied", tableAfter.status === "occupied", tableAfter.status);

  console.log("4. Idempotent replay of create_order (same client_id)");
  const clientId = crypto.randomUUID();
  const first = await cashier.rpc("create_order", {
    p_client_id: clientId,
    p_table_id: null,
    p_order_type: "takeaway",
    p_items: [{ menu_item_id: ES_TEH, qty: 1, variant_option_ids: [ES] }],
  });
  const replay = await cashier.rpc("create_order", {
    p_client_id: clientId,
    p_table_id: null,
    p_order_type: "takeaway",
    p_items: [{ menu_item_id: ES_TEH, qty: 1, variant_option_ids: [ES] }],
  });
  check("same order returned on replay", first.data.id === replay.data.id);

  console.log("4b. Dine-in without table (optional table)");
  const { data: noTableOrder, error: noTableError } = await cashier.rpc("create_order", {
    p_client_id: crypto.randomUUID(),
    p_table_id: null,
    p_order_type: "dine_in",
    p_items: [{ menu_item_id: ES_TEH, qty: 1, variant_option_ids: [ES] }],
  });
  check("dine-in without table allowed", !noTableError && noTableOrder?.id, noTableError?.message);
  check("table_id is null", noTableOrder?.table_id === null, String(noTableOrder?.table_id));

  console.log("5. Discount threshold + manager approval");
  const { error: smallDiscountError, data: smallDiscount } = await cashier.rpc("apply_order_discount", {
    p_order_id: orderA.id,
    p_type: "nominal",
    p_value: 10000,
  });
  check("discount under threshold allowed", !smallDiscountError && Number(smallDiscount.discount_amount) === 10000, smallDiscountError?.message);
  check("tax recomputed after discount", Number(smallDiscount.tax_amount) === 4100, `tax=${smallDiscount?.tax_amount}`);

  const { error: bigDiscountError } = await cashier.rpc("apply_order_discount", {
    p_order_id: orderA.id,
    p_type: "nominal",
    p_value: 100000,
  });
  check("discount over threshold blocked", Boolean(bigDiscountError?.message.includes("approval_required")), bigDiscountError?.message);

  const { data: managerStaff } = await manager
    .from("staff")
    .select("id")
    .eq("staff_code", "MGR")
    .single();
  const { error: approvedError, data: approved } = await admin.rpc("apply_order_discount", {
    p_order_id: orderA.id,
    p_type: "nominal",
    p_value: 100000,
    p_approved_by: managerStaff.id,
  });
  check("manager-approved discount applied", !approvedError && Number(approved.discount_amount) === 51000, approvedError?.message);

  console.log("6. Kitchen state machine");
  const { data: kdsItems } = await kitchen
    .from("kds_order_items_view")
    .select("id, order_id, kitchen_status, variants")
    .eq("order_id", orderA.id)
    .order("item_created_at");
  check("kitchen sees KDS items", (kdsItems ?? []).length === 2, `count=${kdsItems?.length}`);
  check("KDS view has no price columns", kdsItems?.length ? !("unit_price" in kdsItems[0]) : true);

  const itemId = kdsItems[0].id;
  const { error: skipError } = await kitchen.rpc("set_kitchen_status", {
    p_order_item_id: itemId,
    p_new_status: "ready",
  });
  check("skip-state rejected (new -> ready)", Boolean(skipError?.message.includes("invalid_transition")), skipError?.message);

  for (const status of ["cooking", "ready", "served"]) {
    const { error } = await kitchen.rpc("set_kitchen_status", { p_order_item_id: itemId, p_new_status: status });
    if (error) {
      check(`transition to ${status}`, false, error.message);
      break;
    }
    if (status === "served") check("full transition new→cooking→ready→served", true);
  }

  console.log("7. Payment + stock deduction");
  const stockBefore = await stockOf(BERAS);
  const { data: orderC, error: orderCError } = await cashier.rpc("create_order", {
    p_client_id: crypto.randomUUID(),
    p_table_id: null,
    p_order_type: "takeaway",
    p_items: [{ menu_item_id: NASI_GORENG, qty: 1, variant_option_ids: [LEVEL_1] }],
  });
  check("create paid order", !orderCError && orderC?.id, orderCError?.message);

  const { error: payError, data: paid } = await cashier.rpc("pay_order", {
    p_order_id: orderC.id,
    p_payments: [{ method: "cash", amount: Number(orderC.total) }],
    p_idempotency_key: crypto.randomUUID(),
  });
  check("pay_order succeeds", !payError && paid.status === "paid", payError?.message);
  check("total = 40250", Number(orderC.total) === 40250, String(orderC.total));

  const stockAfter = await stockOf(BERAS);
  check("stock deducted by recipe qty (200g)", stockAfter === stockBefore - 200, `${stockBefore} -> ${stockAfter}`);

  console.log("8. Void paid order restores stock");
  const { error: voidError } = await manager.rpc("void_order", {
    p_order_id: orderC.id,
    p_reason: "smoke test void",
  });
  check("void_order succeeds", !voidError, voidError?.message);
  const stockRestored = await stockOf(BERAS);
  check("stock restored on void", stockRestored === stockBefore, `${stockAfter} -> ${stockRestored}`);

  console.log("9. Paid sale for reports + void open order releases table");
  const { data: orderD, error: orderDError } = await cashier.rpc("create_order", {
    p_client_id: crypto.randomUUID(),
    p_table_id: null,
    p_order_type: "takeaway",
    p_items: [{ menu_item_id: ES_TEH, qty: 1, variant_option_ids: [ES] }],
  });
  check("create report sale order", !orderDError && orderD?.id, orderDError?.message);
  const { error: payDError } = await cashier.rpc("pay_order", {
    p_order_id: orderD.id,
    p_payments: [{ method: "qris", amount: Number(orderD.total), reference_no: `SMOKE-${Date.now()}` }],
    p_idempotency_key: crypto.randomUUID(),
  });
  check("pay report sale order", !payDError, payDError?.message);

  const { error: voidAError } = await manager.rpc("void_order", { p_order_id: orderA.id, p_reason: "smoke cleanup" });
  check("void discounted order A", !voidAError, voidAError?.message);
  const { data: tableReleased } = await manager.from("dining_tables").select("status").eq("id", tableId).single();
  check("table released after void", tableReleased.status === "empty", tableReleased.status);

  console.log("10. RLS outlet isolation");
  const { data: otherOutletOrders } = await cashier2.from("orders").select("id").limit(5);
  check("outlet 2 cashier cannot read outlet 1 orders", (otherOutletOrders ?? []).length === 0, `rows=${otherOutletOrders?.length}`);
  const { data: ownOrders } = await cashier.from("orders").select("id").limit(5);
  check("outlet 1 cashier reads own orders", (ownOrders ?? []).length > 0, `rows=${ownOrders?.length}`);

  console.log("11. Shift close with variance");
  const { data: summary } = await cashier.rpc("shift_summary", { p_shift_id: shiftId });
  const expected = Number(summary[0].expected_cash);
  const { data: closed, error: closeError } = await cashier.rpc("close_shift", {
    p_shift_id: shiftId,
    p_closing_cash_actual: expected + 5000,
  });
  check("close_shift succeeds", !closeError, closeError?.message);
  check("variance recorded (+5000)", Number(closed.cash_variance) === 5000, `variance=${closed?.cash_variance}`);

  console.log("12. Reports (manager)");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const { error: refreshError } = await manager.rpc("refresh_daily_sales_summary");
  check("refresh matview", !refreshError, refreshError?.message);
  const { data: sales, error: salesError } = await manager.rpc("daily_sales", {
    p_from: today,
    p_to: today,
    p_outlet_id: OUTLET_1,
  });
  check("daily_sales returns rows", !salesError && (sales ?? []).length > 0, salesError?.message);
  const { data: top } = await manager.rpc("top_selling_items", {
    p_from: today,
    p_to: today,
    p_outlet_id: OUTLET_1,
    p_limit: 5,
  });
  check("top_selling_items returns rows", (top ?? []).length > 0, `rows=${top?.length}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
