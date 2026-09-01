import { test, expect, type Page } from "@playwright/test";

const OWNER_USERNAME = "admin";
const OWNER_PASSWORD = "AdminPass@123";
const CATEGORY_NAME = "فئة اختبار e2e";
const PRODUCT_NAME = "منتج اختبار e2e";
const EDIT_NAME = "منتج اختبار e2e معدل";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(OWNER_USERNAME);
  await page.getByLabel("كلمة المرور").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await page.waitForURL("**/");
}

async function createCategory(page: Page) {
  await page.goto("/categories");
  await page.getByRole("button", { name: "فئة جديدة" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("اسم الفئة").fill(CATEGORY_NAME);
  await dialog.getByRole("button", { name: "إنشاء" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15000 });
  await expect(page.getByText(CATEGORY_NAME, { exact: true }).first()).toBeVisible();
}

test.describe("Product management", () => {
  test("creates, edits and disables a product", async ({ page }) => {
    await login(page);

    // Create a category
    await createCategory(page);

    // Navigate to products
    await page.goto("/products");

    // Create a product
    await page.getByRole("button", { name: "منتج جديد" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("اسم المنتج *").fill(PRODUCT_NAME);
    await dialog.getByLabel("سعر البيع *").fill("50");
    await dialog.getByLabel("الوحدة *").fill("قطعة");

    // Select category
    const categorySelect = dialog.locator("[data-slot='select-trigger']").first();
    await categorySelect.click();
    await page.getByRole("option", { name: CATEGORY_NAME }).click();

    // Submit
    await dialog.getByRole("button", { name: "إنشاء المنتج" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });

    // Product should appear
    await expect(page.getByText(PRODUCT_NAME, { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // --- Edit flow ---
    const row = page.getByText(PRODUCT_NAME, { exact: true }).first().locator("xpath=ancestor::tr");
    await row.getByRole("button").click(); // open actions menu
    await page.getByText("تعديل").click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible({ timeout: 5000 });

    const nameInput = editDialog.getByLabel("اسم المنتج *");
    await nameInput.clear();
    await nameInput.fill(EDIT_NAME);

    await editDialog.getByRole("button", { name: "حفظ التغييرات" }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 15000 });

    // Verify edit appeared
    await expect(page.getByText(EDIT_NAME, { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // --- Disable flow ---
    const row2 = page.getByText(EDIT_NAME, { exact: true }).first().locator("xpath=ancestor::tr");
    await row2.getByRole("button").click();
    await page.getByText("تعطيل").click();

    // Confirmation dialog is shown for the destructive action.
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog.getByRole("button", { name: "تعطيل المنتج" }).click();

    // The product is deactivated and should no longer be in the default "active" view.
    await expect(page.getByText(EDIT_NAME, { exact: true })).toHaveCount(0, { timeout: 15000 });

    // Filter to inactive products and confirm the status is "معطل".
    await page.getByRole("combobox", { name: "تصفية حسب الحالة" }).click();
    await page.getByRole("option", { name: "المعطلة" }).click();
    await expect(page.getByText(EDIT_NAME, { exact: true }).first()).toBeVisible({ timeout: 10000 });
    const disabledRow = page.getByText(EDIT_NAME, { exact: true }).first().locator("xpath=ancestor::tr");
    await expect(disabledRow.getByText("معطل")).toBeVisible();
  });
});
