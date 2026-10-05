/**
 * Verifies Supabase Realtime private broadcast reaches the KDS board
 * without user interaction. Requires app + local Supabase running.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const BASE = "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function login(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: otpError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (otpError) throw new Error(otpError.message);
  return client;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
let realtimeEvents = 0;
page.on("websocket", (socket) => {
  if (socket.url().includes("realtime")) {
    socket.on("framereceived", () => {
      realtimeEvents += 1;
    });
  }
});

try {
  await page.goto(`${BASE}/login`);
  await page.getByRole("combobox").click();
  await page.waitForSelector('[role="option"]');
  await page.getByRole("option", { name: "Warung Nusantara — Pusat" }).click();
  await page.getByLabel("Kode Staff").fill("DAP");
  await page.getByLabel("PIN").fill("5555");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(/\/kds/, { timeout: 15000 });
  await page.waitForSelector("text=Baru");

  const cashier = await login("cashier1.pst@outlet.internal");
  const { data: shift } = await cashier
    .from("shifts")
    .select("id")
    .is("closed_at", null)
    .maybeSingle();
  if (!shift) {
    const { error } = await cashier.rpc("open_shift", { p_opening_cash: 100000 });
    if (error) throw new Error(error.message);
  }

  const { error: orderError } = await cashier.rpc("create_order", {
    p_client_id: crypto.randomUUID(),
    p_table_id: null,
    p_order_type: "takeaway",
    p_items: [
      { menu_item_id: "d0000000-0000-0000-0000-000000000006", qty: 1 },
      { menu_item_id: "d0000000-0000-0000-0000-000000000004", qty: 1, variant_option_ids: ["f0000000-0000-0000-0000-00000000000a"] },
    ],
  });
  if (orderError) throw new Error(orderError.message);

  // No clicks, no polling wait beyond the fallback interval: the board must
  // receive the private broadcast.
  await page.waitForSelector("text=Kentang Goreng", { timeout: 5000 });
  const appeared = (await page.getByText("Kentang Goreng").count()) > 0;

  console.log(`  ${appeared ? "✓" : "✗"} KDS received new order via realtime broadcast (frames: ${realtimeEvents})`);
  process.exit(appeared ? 0 : 1);
} catch (error) {
  console.error("  ✗ fatal:", error.message);
  await page.screenshot({ path: "/tmp/pos-kds-realtime-failure.png" }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
