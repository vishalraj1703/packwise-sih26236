import { expect, test } from "@playwright/test";

test("phone-width layout has no horizontal scroll and keeps food photos", async ({ page }) => {
  await page.goto("/assess");
  await expect(page.locator('img[src^="/images/"]').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
