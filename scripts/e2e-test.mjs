/**
 * Browser E2E smoke test (uses installed Chrome via channel).
 * Requires the app running on http://localhost:3000 and local Supabase up.
 * Usage: node scripts/e2e-test.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

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

async function login(page, { outlet, staffCode, pin }) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("combobox").click();
  await page.waitForSelector('[role="option"]');
  await page.getByRole("option", { name: outlet }).click();
  await page.getByLabel("Kode Staff").fill(staffCode);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
}

async function logout(page) {
  await page.getByRole("button", { name: /Keluar/i }).first().click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  console.log("1. Cashier opens shift");
  await login(page, { outlet: "Warung Nusantara — Pusat", staffCode: "KSR1", pin: "3333" });
  await page.goto(`${BASE}/pos/shift`);
  await page.waitForSelector("text=Buka Shift", { timeout: 15000 });
  check("cashier sees shift page", page.url().includes("/pos/shift"));
  await page.getByLabel("Kas Awal (Rp)").fill("500000");
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await page.waitForURL(/\/pos$/, { timeout: 15000 });
  check("shift open, on POS", /\/pos$/.test(page.url()));

  console.log("2. POS: add item with variant and pay");
  await page.getByRole("button", { name: "Nasi Goreng Spesial" }).click();
  await page.getByRole("button", { name: "Level 1", exact: true }).click();
  await page.getByRole("button", { name: "Tambah ke keranjang" }).click();
  await page.getByRole("button", { name: "Es Teh Manis" }).click();
  await page.getByRole("button", { name: "Es", exact: true }).click();
  await page.getByRole("button", { name: "Tambah ke keranjang" }).click();
  check("cart shows 2 lines", (await page.locator("aside").getByText("Nasi Goreng Spesial").count()) > 0);

  await page.getByRole("combobox").click();
  await page.waitForSelector('[role="option"]');
  const tableOptions = await page.getByRole("option").allInnerTexts();
  const emptyTable = tableOptions.find((label) => label.includes("empty"));
  await page.getByRole("option", { name: emptyTable }).click();

  await page.getByTestId("cart-pay").click();
  await page.waitForURL(/\/pos\/checkout/, { timeout: 15000 });
  await page.getByTestId("pay-submit").waitFor({ timeout: 15000 });
  check("navigated to checkout", page.url().includes("/pos/checkout"));
  const totalText = await page.getByText(/Total/).last().textContent();
  check("checkout shows total", Boolean(totalText));

  await page.getByTestId("pay-submit").click();
  await page.waitForURL(/\/pos$/, { timeout: 20000 });
  check("payment completed, back to POS", /\/pos$/.test(page.url()));

  console.log("2b. Dine-in without table is allowed");
  const cart = page.locator("aside").filter({ hasText: "Keranjang" });
  await page.getByRole("button", { name: "Es Teh Manis" }).click();
  await page.getByRole("button", { name: "Es", exact: true }).click();
  await page.getByRole("button", { name: "Tambah ke keranjang" }).click();
  await cart.getByText("Es Teh Manis").waitFor({ timeout: 5000 });
  await page.getByTestId("cart-kitchen").click();
  await page.getByText(/dikirim ke dapur/).waitFor({ timeout: 15000 });
  const kitchenToast = (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" ");
  const cartText = (await cart.innerText()).replace(/\n+/g, " | ");
  check(
    "order sent to kitchen without table",
    kitchenToast.includes("dikirim ke dapur"),
    `toast="${kitchenToast}" cart="${cartText.slice(0, 160)}"`,
  );

  console.log("3. Open orders page lists unpaid orders");
  await page.goto(`${BASE}/pos/orders`);
  await page.waitForSelector("text=Pesanan Berjalan");
  check("open orders page renders", (await page.getByText("Pesanan Berjalan").count()) > 0);
  check("unpaid order card is listed", (await page.getByTestId("open-order-card").count()) > 0);

  console.log("4. Tables page reflects order history");
  await page.goto(`${BASE}/pos/tables`);
  await page.waitForSelector("text=Floor Plan");
  check("floor plan renders", (await page.getByText("Floor Plan").count()) > 0);

  await logout(page);

  console.log("4. Kitchen KDS realtime board");
  await login(page, { outlet: "Warung Nusantara — Pusat", staffCode: "DAP", pin: "5555" });
  await page.waitForURL(/\/kds/, { timeout: 15000 });
  check("kitchen landed on KDS", page.url().includes("/kds"));
  await page.waitForSelector("text=Baru", { timeout: 15000 });
  const nasiCount = await page.getByText("Nasi Goreng Spesial").count();
  check("KDS shows paid-but-unserved item", nasiCount > 0, `count=${nasiCount}`);

  const column = (label) =>
    page.locator("section").filter({ has: page.getByRole("heading", { name: label }) });

  const waitForInColumn = async (label, text, timeout = 10000) => {
    try {
      await column(label).getByText(text).first().waitFor({ timeout });
      return true;
    } catch {
      return false;
    }
  };

  const nasiIn = (label) =>
    column(label).locator('[data-testid="kds-item"][data-menu="Nasi Goreng Spesial"]').first();

  await nasiIn("Baru").getByRole("button", { name: "Mulai Masak" }).click();
  check("item moved to cooking", await waitForInColumn("Dimasak", "Nasi Goreng Spesial"));

  await nasiIn("Dimasak").getByRole("button", { name: "Siap" }).click();
  check("item moved to ready", await waitForInColumn("Siap Saji", "Nasi Goreng Spesial"));

  await nasiIn("Siap Saji").getByRole("button", { name: "Disajikan" }).click();
  await page.waitForTimeout(1500);
  const nasiLeft = await page.getByText("Nasi Goreng Spesial").count();
  check("served item removed from board", nasiLeft === 0, `remaining=${nasiLeft}`);

  await logout(page);

  console.log("5. Manager reports");
  await login(page, { outlet: "Warung Nusantara — Pusat", staffCode: "MGR", pin: "2222" });
  await page.waitForURL(/\/admin\/reports/, { timeout: 15000 });
  check("manager landed on reports", page.url().includes("/admin/reports"));
  await page.waitForSelector("text=Omzet Harian", { timeout: 15000 });
  const hasSales = (await page.getByText("Rp").count()) > 0;
  check("reports render currency data", hasSales);

  await page.goto(`${BASE}/admin/menu`);
  await page.waitForSelector("text=Daftar Menu");
  check("admin menu page renders", (await page.getByText("Daftar Menu").count()) > 0);

  await page.goto(`${BASE}/admin/stock`);
  await page.waitForSelector("text=Bahan & Stok");
  check("admin stock page renders", (await page.getByText("Bahan & Stok").count()) > 0);

  await page.goto(`${BASE}/admin/staff`);
  await page.waitForSelector("text=Daftar Staff");
  check("admin staff page renders", (await page.getByText("Daftar Staff").count()) > 0);

  await logout(page);

  console.log("6. Owner login sees all outlets");
  await login(page, { outlet: "Warung Nusantara — Pusat", staffCode: "OWN", pin: "1111" });
  await page.waitForURL(/\/admin\/reports/, { timeout: 15000 });
  check("owner landed on reports", page.url().includes("/admin/reports"));
  await page.waitForSelector("text=Omzet Harian", { timeout: 15000 });
  check("owner report renders", (await page.getByText("Omzet Harian").count()) > 0);
  await page.getByRole("combobox").click();
  await page.waitForSelector('[role="option"]');
  const ownerOutletOptions = await page.getByRole("option").allInnerTexts();
  check("owner can filter all outlets", ownerOutletOptions.some((label) => label.includes("Semua outlet")));

  const posLinks = await page.locator('aside a[href^="/pos"], aside a[href^="/kds"]').count();
  check("owner nav hides POS/KDS menus", posLinks === 0, `links=${posLinks}`);

  await page.goto(`${BASE}/admin/menu`);
  await page.waitForSelector("text=Daftar Menu");
  check("owner sees menu admin", (await page.getByText("Daftar Menu").count()) > 0);
  check("owner menu list is not empty", (await page.getByText("Nasi Goreng Spesial").count()) > 0);
} catch (error) {
  failed += 1;
  console.error("  ✗ fatal:", error.message);
  await page.screenshot({ path: "/tmp/pos-kds-e2e-failure.png" }).catch(() => {});
} finally {
  const realErrors = consoleErrors.filter(
    (text) => !text.includes("favicon") && !text.includes("Download the React DevTools"),
  );
  if (realErrors.length > 0) {
    console.log(`\n  browser console errors (${realErrors.length}):`);
    realErrors.slice(0, 10).forEach((text) => console.log(`    - ${text}`));
  }
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
