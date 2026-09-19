import { expect, test } from "@playwright/test";

// Writes a real (pending, never approved) note to whatever database BASE_URL is
// backed by, so it runs only when SMOKE_WRITE is set.
test("a note drawn on the mat and pinned up shows on the wall as pending", async ({
  page,
}) => {
  test.skip(!process.env.SMOKE_WRITE, "writes a note; set SMOKE_WRITE");

  await page.goto("/sticky-notes");
  await page.getByRole("link", { name: "Pin a note" }).click();

  // A tap that lands before the island has hydrated does nothing, so keep
  // tapping the yellow pad on the chooser until a sheet is down. The pads
  // overlap, so the tap goes on the strip of it that shows.
  const paper = page.locator("[data-colour]");
  await expect(async () => {
    if (!(await paper.isVisible()))
      await page
        .getByRole("button", { name: "Tear off a yellow sheet" })
        .click({ position: { x: 40, y: 20 }, timeout: 1000 });
    await expect(paper).toBeVisible({ timeout: 500 });
  }).toPass();

  // A torn sheet comes with the black marker held. Hovering waits for the sheet
  // to finish flying off the pad, so the box measured is where it lies.
  await expect(
    page.getByRole("button", { name: "Put down the black marker" }),
  ).toHaveAttribute("aria-pressed", "true");
  await paper.hover();
  const box = await paper.boundingBox();
  if (!box) throw new Error("the sheet has no box");
  const at = (x: number, y: number) =>
    [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(0.3, 0.45));
  await page.mouse.down();
  await page.mouse.move(...at(0.5, 0.6), { steps: 8 });
  await page.mouse.move(...at(0.7, 0.45), { steps: 8 });
  await page.mouse.up();
  await expect(paper.locator("[data-elements] path")).toHaveCount(1);

  await page.getByRole("button", { name: "pin it up" }).click();
  const spotlight = page.getByRole("dialog", { name: "Pin it up" });
  await spotlight
    .getByRole("button", { name: "Fasten it with a red pin" })
    .click();

  const posted = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/_serverFn/"),
  );
  const name = spotlight.getByRole("textbox", { name: "Your name" });
  await name.fill("Playwright");
  await name.press("Enter");
  expect((await posted).ok()).toBe(true);

  await expect(page).toHaveURL(/\/sticky-notes$/);
  // signed "Playwright", stored lowercase, waiting on approval
  const tile = page.getByRole("button", { name: "Zoom note by playwright" });
  await expect(tile.getByText("Pending")).toBeVisible();
});
