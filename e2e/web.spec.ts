import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.PACKWISE_DEMO_PASSWORD ?? "packwise-demo";

async function runCashewExample(page: Page) {
  await page.goto("/assess");
  await page.getByRole("button", { name: "Load cashew example" }).click();
  await page.getByRole("button", { name: "Next →" }).click(); // food → order
  await page.getByRole("button", { name: "Next →" }).click(); // order → journey
  await page.getByRole("button", { name: /Analyse route/ }).click();
  await expect(page.getByRole("button", { name: "Next →" })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "Next →" }).click(); // journey → evidence
  await page.getByRole("button", { name: "Next →" }).click(); // evidence → review
  await page.getByRole("button", { name: "Show my options" }).click();
  await page.waitForURL(/\/results\//, { timeout: 60_000 });
}

test("home page shows real food photos, not emoji", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PackWise").first()).toBeVisible();
  await page.goto("/assess");
  const photos = page.locator('img[src^="/images/"]');
  await expect(photos.first()).toBeVisible();
  expect(await photos.count()).toBeGreaterThanOrEqual(10);
  // every photo actually loads
  const broken = await photos.evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).length);
  expect(broken).toBe(0);
});

test("cashew assessment on the Python engine gives priced, explained plans with pack photos", async ({ page }) => {
  await runCashewExample(page);
  await expect(page.getByText("Choose among feasible plans")).toBeVisible();
  await expect(page.getByText(/packwise-engine 2\.\d+\.\d+ \(Python\/NumPy\/SciPy/)).toBeVisible();
  await expect(page.getByText("Lowest evaluated cost").first()).toBeVisible();
  await expect(page.getByText(/₹[\d,]+/).first()).toBeVisible();
  await expect(page.getByText(/Looks like:/).first()).toBeVisible();
  await expect(page.locator('img[src^="/images/pack-"]').first()).toBeVisible();
  await expect(page.getByText(/unreviewed seed\/reference values/)).toBeVisible();
});

test("when the server is unreachable the browser computes the result itself (IndexedDB)", async ({ page }) => {
  await page.route("**/api/assessments/**", (r) => r.abort("internetdisconnected"));
  await page.route("**/api/assessments", (r) => r.abort("internetdisconnected"));
  await runCashewExample(page);
  await expect(page).toHaveURL(/\/results\/local$/);
  await expect(page.getByText("Choose among feasible plans")).toBeVisible();
  const stored = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open("packwise");
        req.onsuccess = () => resolve(req.result.objectStoreNames.length > 0);
        req.onerror = () => resolve(false);
      }),
  );
  expect(stored).toBe(true);
});

test("methods page lists photo credits", async ({ page }) => {
  await page.goto("/evidence#photo-credits");
  await expect(page.locator("#photo-credits")).toBeVisible();
  await expect(page.locator("#photo-credits")).toContainText("Cashews2.JPG");
  await expect(page.locator("#photo-credits")).toContainText("Stand-up pouch.jpg");
});

test("QR batch page is public and shows the journey and a report button", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: { email: "producer@demo.packwise", password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const batches = await (await request.get("/api/batches")).json();
  const token = (Array.isArray(batches) ? batches : batches.batches)[0].public_token as string;
  const qr = await request.get(`/api/qr/${token}.svg`);
  expect(qr.headers()["content-type"]).toContain("svg");
  await page.goto(`/t/${token}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Report/i).first()).toBeVisible();
});
