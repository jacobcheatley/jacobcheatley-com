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

test("the Sticky Notes editor loads with the mat over the wall", async ({
  page,
}) => {
  const response = await page.goto("/sticky-notes/new");
  expect(response?.status()).toBe(200);
  // the tear-off pad shows only once the editor island has mounted
  await expect(page.getByRole("link", { name: /the wall/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tear off a yellow sheet" }),
  ).toBeVisible();
});
