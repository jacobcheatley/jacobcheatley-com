import { expect, test } from "@playwright/test";

test("/ responds 200 and the h1 is the name", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Jacob Cheatley");
});

test("the retired /guestbook route is gone (404)", async ({ request }) => {
  const response = await request.get("/guestbook");
  expect(response.status()).toBe(404);
});

// The Sticky Notes write-path smoke returns with the editor route (#61).
