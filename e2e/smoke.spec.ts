import { expect, test } from "@playwright/test";

test("/ responds 200 and the h1 is visible", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toBeVisible();
});
