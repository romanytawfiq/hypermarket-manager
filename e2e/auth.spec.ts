import { test, expect, type Page } from "@playwright/test";

const OWNER_USERNAME = "admin";
const OWNER_PASSWORD = "AdminPass@123";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(OWNER_USERNAME);
  await page.getByLabel("كلمة المرور").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await page.waitForURL("**/");
}

test.describe("Authentication", () => {
  test("logs in and reaches the dashboard", async ({ page }) => {
    await login(page);
    await expect(page.getByText("نكسا ريتيل").first()).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("اسم المستخدم").fill(OWNER_USERNAME);
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
