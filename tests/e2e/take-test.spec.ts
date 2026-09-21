/**
 * Playwright not installed in this scaffold's devDependencies yet — add
 * `@playwright/test` when Part 6 (mocks) needs the full backgrounding/
 * refresh coverage this file's TODO list implies. Stubbed now so the
 * intended coverage is documented and CI's structure doesn't need to
 * change again later.
 *
 * Run with: npx playwright test tests/e2e
 */
import { test, expect } from "@playwright/test";

test.describe("take a topic quiz end-to-end", () => {
  test.skip("login → quiz → submit → result", async ({ page }) => {
    // 1. Log in with an allowlisted email.
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(process.env.E2E_TEST_EMAIL ?? "");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/dashboard/);

    // 2. Navigate to a unit and launch a topic quiz.
    await page.getByRole("link", { name: /browse syllabus/i }).click();
    await page.getByRole("link").first().click();
    await page.getByRole("link", { name: /start topic quiz/i }).first().click();
    await page.getByRole("button", { name: /start quiz/i }).click();
    await expect(page).toHaveURL(/\/tests\/.+/);

    // 3. Answer the first question, refresh, and confirm the answer
    //    survived (autosave/resume — architecture §23).
    await page.getByRole("button").first().click();
    await page.reload();

    // 4. Submit and confirm.
    await page.getByRole("button", { name: /submit test/i }).first().click();
    await page.getByRole("button", { name: /^submit$/i }).click();
    await expect(page).toHaveURL(/result/);

    // 5. View the scored result.
    await expect(page.getByText(/score/i)).toBeVisible();
  });
});
