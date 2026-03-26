import { expect, test } from "@playwright/test";

test("renders the Precision Lab workspace shell", async ({ page }) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "OK",
        message: "Playwright stub",
        timestamp: "2026-03-26T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/dashboard");

  await expect(
    page.getByRole("heading", { name: "调度中心" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Precision Lab migration cockpit" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "调度中心" })).toBeVisible();
  await expect(page.getByText("Scaffold live")).toBeVisible();
});
