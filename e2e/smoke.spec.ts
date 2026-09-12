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

// Write path (staging only): submit an entry and see the pending confirmation.
// A window marker set before submit must survive, proving the server function
// ran without a full page load. The entry stays pending, so it is not asserted
// in the list; leave or reject pending smoke entries with the CLI.
if (process.env.SMOKE_WRITE === "1") {
  test("submitting the guestbook form shows the pending confirmation", async ({
    page,
  }) => {
    await page.goto("/guestbook");
    await page.evaluate(() => {
      (window as unknown as { __smoke: boolean }).__smoke = true;
    });

    const runId = process.env.GITHUB_RUN_ID ?? String(Date.now());
    await page.getByLabel("Name").fill(`smoke ${runId}`);
    await page.getByLabel("Message").fill("Smoke test entry, please ignore.");
    await page.getByRole("button").click();

    await expect(
      page.getByText(/appear once it has been approved/i),
    ).toBeVisible();
    const marker = await page.evaluate(
      () => (window as unknown as { __smoke?: boolean }).__smoke,
    );
    expect(marker).toBe(true);
  });
}
