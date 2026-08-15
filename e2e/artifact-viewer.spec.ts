import { expect, test } from "@playwright/test";

test("artifact previews remain visible and stale loads cannot replace the selection", async ({ page }) => {
  await page.goto("/dev-harness/artifact-viewer");

  await expect(page.getByText("Stable artifact preview")).toBeVisible();

  await page.getByRole("button", { name: "Image fixture" }).click();
  const image = page.getByRole("img", { name: "pixel.png" });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^blob:/);
  await page.waitForTimeout(500);
  await expect(image).toBeVisible();

  await page.getByRole("button", { name: "Slow fixture" }).click();
  await expect(page.getByLabel("Loading artifact")).toBeVisible();
  await page.getByRole("button", { name: "Text fixture" }).click();
  await expect(page.getByText("Stable artifact preview")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText("Stale slow artifact")).toHaveCount(0);

  await page.getByRole("button", { name: "Failure fixture" }).click();
  await expect(page.getByText("Synthetic artifact failure", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Recovered after retry")).toBeVisible();
});
