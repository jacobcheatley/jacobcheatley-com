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

// Neither environment is seeded, so this passes on a Blog with no Articles.
test("/blog responds 200 and the h1 is the Blog", async ({ page }) => {
  const response = await page.goto("/blog");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blog");
});

test("a slug with no Published Article gets the Blog's 404", async ({
  page,
}) => {
  const response = await page.goto("/blog/no-article-has-this-slug");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "No Article here.",
  );
  await expect(page.getByRole("link", { name: "All Articles" })).toBeVisible();
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
