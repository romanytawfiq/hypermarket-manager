import { test, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";

const OWNER_USERNAME = "admin";
const OWNER_PASSWORD = "AdminPass@123";
const DRINK = "مشروب اختبار طباعة";
const COFFEE = "قهوة اختبار طباعة";
const RESTOCK = /INV-\d{8}-\d{4}/;
const ORDER_NO = /CF-\d{8}-\d{4}/;

/** Fresh, deterministic storefront data (products + stock + open shift). */
function runSeed(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "scripts/seed-e2e-receipt.ts"], {
      cwd: process.cwd(),
      shell: true,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[receipt-e2e] seed failed (exit ${code})`));
    });
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(OWNER_USERNAME);
  await page.getByLabel("كلمة المرور").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await page.waitForURL("**/");
}

test.describe.serial("Phase 8 — thermal printing", () => {
  test("completes a POS sale and prints the sale receipt from the success dialog", async ({ page }) => {
    test.setTimeout(180000);
    await runSeed();
    await login(page);

    // --- Sell one drink through the POS ---
    await page.goto("/pos");
    await page.getByPlaceholder("مسح أو بحث عن منتج (باركود / رمز / اسم)").fill(DRINK);
    await page.getByRole("button", { name: DRINK }).click();
    await page.getByRole("button", { name: "نقدي" }).first().click();

    const payButton = page.getByRole("button", { name: "إتمام الدفع" });
    await expect(payButton).toBeEnabled();
    await payButton.click();

    // --- Success dialog shows the authoritative receipt ---
    const dialog = page.getByRole("dialog", { name: "فاتورة البيع" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(DRINK)).toBeVisible();
    await expect(dialog.getByText(/ج\.م/).first()).toBeVisible();

    const printButton = dialog.getByRole("button", { name: /طباعة الفاتورة/ });
    await expect(printButton).toBeVisible();

    // --- The canonical print route opens in a new window ---
    const popupPromise = page.waitForEvent("popup");
    await printButton.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup).toHaveURL(/\/print\/sale\/.+w=80mm/);

    // Store identity, item, and a valid invoice number are rendered.
    await expect(popup.getByText("نكسا ريتيل")).toBeVisible();
    await expect(popup.getByText(RESTOCK)).toBeVisible();
    await expect(popup.getByText(DRINK)).toBeVisible();
    await expect(popup.getByText(/ج\.م/).first()).toBeVisible();
    await expect(popup.getByText("شكرًا لزيارتكم")).toBeVisible();
    await expect(popup.getByRole("button", { name: "طباعة" })).toBeVisible();
  });

  test("creates a café order and prints its receipt (sugar level + linked invoice)", async ({ page }) => {
    test.setTimeout(180000);
    await runSeed();
    await login(page);

    // --- Create a café order with an explicit sugar level ---
    await page.goto("/cafe");
    await page.getByRole("button", { name: "طلب جديد" }).click();
    const builder = page.getByRole("dialog", { name: "طلب كافيه جديد" });
    await expect(builder).toBeVisible();

    await builder.getByLabel("ابحث عن منتج").fill(COFFEE);
    await builder.getByRole("button", { name: COFFEE }).click();
    await expect(builder.getByText(COFFEE)).toBeVisible();

    await builder.getByLabel("اختر درجة السكر").click();
    await page.getByRole("option", { name: "زيادة", exact: true }).click();

    await builder.getByRole("button", { name: "نقدي (دفع كامل)" }).click();
    await builder.getByRole("button", { name: "إرسال إلى الباريستا" }).click();

    // The success toast exposes both the order number and its linked invoice.
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: ORDER_NO }).last();
    await expect(toast).toBeVisible();
    const toastText = (await toast.innerText()).replace(/\s+/g, " ");
    const orderNo = toastText.match(/CF-\d{8}-\d{4}/)?.[0];
    const invoiceNo = toastText.match(/INV-\d{8}-\d{4}/)?.[0];
    expect(orderNo).toBeTruthy();
    expect(invoiceNo).toBeTruthy();

    // --- Print from the successful-order toast ---
    const popupPromise = page.waitForEvent("popup");
    await toast.getByRole("button", { name: "طباعة" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup).toHaveURL(/\/print\/cafe\/.+/);

    // The café receipt carries the order + linked invoice numbers, the sugar
    // note, the item, and the store identity.
    await expect(popup.getByText(orderNo as string)).toBeVisible();
    await expect(popup.getByText(invoiceNo as string)).toBeVisible();
    await expect(popup.getByText(COFFEE)).toBeVisible();
    await expect(popup.getByText(/سكرية: زيادة/)).toBeVisible();
    await expect(popup.getByText("نكسا ريتيل")).toBeVisible();
  });
});