import { expect, test } from "@playwright/test";

test("/ responds 200 and the h1 is visible", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toBeVisible();
});

test("/guestbook SSR HTML has the h1 and the entries list", async ({
  request,
}) => {
  const response = await request.get("/guestbook");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("<h1>Guestbook</h1>");
  expect(html).toContain("<ul>");
});
