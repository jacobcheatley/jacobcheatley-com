import { expect, type Locator, type Page, test } from "@playwright/test";

// A tap that lands before the island has hydrated does nothing, so keep tapping
// the yellow pad on the chooser until a sheet is down. The pads overlap, so the
// tap goes on the strip of it that shows.
async function tearOffASheet(page: Page): Promise<Locator> {
  const paper = page.locator("[data-colour]");
  await expect(async () => {
    if (!(await paper.isVisible()))
      await page
        .getByRole("button", { name: "Tear off a yellow sheet" })
        .click({ position: { x: 40, y: 20 }, timeout: 1000 });
    await expect(paper).toBeVisible({ timeout: 500 });
  }).toPass();
  return paper;
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (!box)
    throw new Error(`${await target.getAttribute("aria-label")} has no box`);
  return box;
}

// Writes a real (pending, never approved) note to whatever database BASE_URL is
// backed by, so it runs only when SMOKE_WRITE is set.
test("a note drawn on the mat and pinned up shows on the wall as pending", async ({
  page,
}) => {
  test.skip(!process.env.SMOKE_WRITE, "writes a note; set SMOKE_WRITE");

  await page.goto("/sticky-notes");
  await page.getByRole("link", { name: "Pin a note" }).click();
  const paper = await tearOffASheet(page);

  // A torn sheet comes with the black marker held. Hovering waits for the sheet
  // to finish flying off the pad, so the box measured is where it lies.
  await expect(
    page.getByRole("button", { name: "Put down the black marker" }),
  ).toHaveAttribute("aria-pressed", "true");
  await paper.hover();
  const box = await boxOf(paper);
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

// The narrow screen the tray is sized for: the objects are only ever measured
// in a browser, so the sizes and the one row they lie in are pinned here.
const PHONE = { width: 360, height: 780 };

test.describe("the tray on a phone", () => {
  test.use({ viewport: PHONE });

  async function trayObjects(page: Page): Promise<Locator[]> {
    await page.goto("/sticky-notes/new");
    await tearOffASheet(page);
    const objects = page.locator('[data-slot="tray"] button');
    await expect(objects.first()).toBeVisible();
    return objects.all();
  }

  test("gives every object a thumb to be hit by, wholly on screen", async ({
    page,
  }) => {
    for (const object of await trayObjects(page)) {
      const box = await boxOf(object);
      // a marker is only 30 wide (they lie shoulder to shoulder), so its
      // height is what makes it hittable
      expect(Math.max(box.width, box.height)).toBeGreaterThanOrEqual(48);
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(30);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    }
  });

  test("keeps the objects in one row, the rocker standing up in it", async ({
    page,
  }) => {
    const [first, ...rest] = await Promise.all(
      (await trayObjects(page)).map((object) => boxOf(object)),
    );
    if (!first) throw new Error("the tray is bare");
    for (const box of rest) {
      // a wrapped row would lie wholly below the first object
      expect(box.y).toBeLessThan(first.y + first.height);
      expect(box.y + box.height).toBeGreaterThan(first.y);
    }

    // the rocker is upright — squiggle over Aa — so it costs one object's width
    const draw = await boxOf(
      page.getByRole("button", { name: "Draw with the marker" }),
    );
    const write = await boxOf(
      page.getByRole("button", { name: "Write with the marker" }),
    );
    expect(draw.x).toBeCloseTo(write.x, 0);
    expect(draw.y).toBeLessThan(write.y);
  });
});
