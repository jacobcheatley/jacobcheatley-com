import { expect, test } from "@playwright/test";

test("/ responds 200 and the h1 is the name", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Jacob Cheatley");
});

test("the favicon link in the head serves a PNG", async ({ page, request }) => {
  await page.goto("/");
  const faviconUrl = await page
    .locator('link[rel="icon"]')
    .evaluate((link: HTMLLinkElement) => link.href);
  const response = await request.get(faviconUrl);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
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

// The Blog editor is not in this build at all, so the URL is a slug with no
// Published Article: either way, 404.
test("the Blog editor's URL is not a page here (404)", async ({ request }) => {
  const response = await request.get("/blog/write");
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

// The roster ships with the migration, so every environment has Matchups.
test("/elemental-showdown responds 200 and shows a Matchup", async ({
  page,
}) => {
  const response = await page.goto("/elemental-showdown");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("slider")).toBeVisible();
});

// A fresh browser has cast nothing, so the Stats are locked to it however many
// Votes the crowd has behind it.
test("/elemental-showdown/stats shows the locked screen to a fresh browser", async ({
  page,
}) => {
  const response = await page.goto("/elemental-showdown/stats");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "the stats are locked",
  );
  await expect(page.getByRole("link", { name: "keep voting" })).toBeVisible();
});

// Reading, never voting: the cookie is set by a deliberate Vote and nothing
// else, which is why there is no cookie notice.
test("being shown a Matchup leaves no cookie behind", async ({ page }) => {
  await page.goto("/elemental-showdown");
  expect(await page.context().cookies()).not.toContainEqual(
    expect.objectContaining({ name: "elemental_showdown_voter" }),
  );
});
