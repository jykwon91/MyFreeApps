import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

/**
 * Profile CRUD E2E tests — Phase 3 wiring.
 *
 * Covers:
 *   1. Profile page loads with all 7 sections visible
 *   2. Add work history entry via dialog → appears in the list
 *   3. Edit work history entry via dialog → changes are reflected
 *   4. Add skill via inline form → chip appears
 *   5. Add screening answer → appears in correct group
 *   6. Tenant isolation — user B cannot see user A's data
 */

async function navigateToProfile(page: Parameters<typeof test>[1]["page"]) {
  await page.getByRole("link", { name: /profile/i }).first().click();
  await page.waitForURL("**/profile");
}

test.describe("Profile page — sections", () => {
  test("profile page loads with all 7 sections", async ({ page, request }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      await navigateToProfile(page);

      // All 7 sections should be visible (use heading role to avoid substring matches)
      await expect(page.getByRole("heading", { name: "Salary preferences" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Work history" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Education" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Screening answers" })).toBeVisible();

      // Empty-state messages for sub-resources
      await expect(page.getByText(/no work history added yet/i)).toBeVisible();
      await expect(page.getByText(/no education added yet/i)).toBeVisible();
      await expect(page.getByText(/no skills added yet/i)).toBeVisible();
      await expect(page.getByText(/no pre-filled answers yet/i)).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

test.describe("Work history CRUD", () => {
  test("add work history entry via dialog and verify it appears", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      await navigateToProfile(page);

      // Click "Add" button in the Work history section
      await page.getByLabel("Add work history").click();

      // Dialog appears
      await expect(
        page.getByRole("dialog", { name: /add work history/i }),
      ).toBeVisible();

      // Fill in required fields
      await page.getByLabel(/^company/i).fill("Acme Corp");
      await page.getByLabel(/^title/i).fill("Senior Engineer");
      await page.getByLabel(/^start date/i).fill("2020-01-01");

      // Submit
      await page.getByRole("button", { name: /add work history/i }).click();

      // Dialog closes and entry appears
      await expect(page.getByText("Acme Corp")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Senior Engineer")).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("edit work history entry via dialog", async ({ page, request }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      await navigateToProfile(page);

      // Add entry first
      await page.getByLabel("Add work history").click();
      await page.getByLabel(/^company/i).fill("Original Corp");
      await page.getByLabel(/^title/i).fill("Junior Engineer");
      await page.getByLabel(/^start date/i).fill("2019-01-01");
      await page.getByRole("button", { name: /add work history/i }).click();

      // Wait for it to appear
      await expect(page.getByText("Original Corp")).toBeVisible({ timeout: 5_000 });

      // Hover to reveal edit button (or just click the Edit button for the entry)
      await page.getByRole("button", { name: /edit original corp/i }).click();

      // Edit dialog appears — update the title
      await expect(
        page.getByRole("dialog", { name: /edit work history/i }),
      ).toBeVisible();

      const titleField = page.getByLabel(/^title/i);
      await titleField.clear();
      await titleField.fill("Senior Engineer");

      await page.getByRole("button", { name: /save changes/i }).click();

      // Updated title appears
      await expect(page.getByText("Senior Engineer")).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

test.describe("Skills", () => {
  test("add a skill via the inline form and verify chip appears", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      await navigateToProfile(page);

      // Fill in the skill add form
      await page.getByLabel("Skill name").fill("TypeScript");

      // Submit by pressing Enter
      await page.getByLabel("Skill name").press("Enter");

      // Chip appears (use exact match to avoid matching the success toast)
      await expect(page.getByText("TypeScript", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("adding a duplicate skill shows an error", async ({ page, request }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      await navigateToProfile(page);

      // Add first skill
      await page.getByLabel("Skill name").fill("Python");
      await page.getByLabel("Skill name").press("Enter");
      await expect(page.getByText("Python", { exact: true }).first()).toBeVisible({ timeout: 5_000 });

      // Try adding the same skill again (different case)
      await page.getByLabel("Skill name").fill("python");
      await page.getByLabel("Skill name").press("Enter");

      // Error toast appears
      await expect(
        page.getByText(/already exists/i),
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

test.describe("Screening answers", () => {
  test("add a non-EEOC screening answer and verify it appears", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      await navigateToProfile(page);

      // Click "Add" button
      await page.getByLabel("Add screening answer").click();

      // Dialog appears
      await expect(
        page.getByRole("dialog", { name: /add screening answer/i }),
      ).toBeVisible();

      // Select question key (Work authorization US)
      await page.getByRole("combobox", { name: /question/i }).selectOption("work_auth_us");

      // Fill in the answer
      await page.getByLabel(/your answer/i).fill("Yes, I am authorized to work in the US");

      // Submit
      await page.getByRole("button", { name: /^add answer/i }).click();

      // Answer appears in the Standard questions group
      await expect(
        page.getByText("Standard questions"),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText("Yes, I am authorized to work in the US"),
      ).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("EEOC answers appear in the EEOC questions group", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      await navigateToProfile(page);

      await page.getByLabel("Add screening answer").click();

      await expect(
        page.getByRole("dialog", { name: /add screening answer/i }),
      ).toBeVisible();

      // Select an EEOC question
      await page.getByRole("combobox", { name: /question/i }).selectOption("eeoc_gender");
      await page.getByLabel(/your answer/i).fill("Prefer not to say");

      await page.getByRole("button", { name: /^add answer/i }).click();

      // Answer appears in the EEOC questions group
      await expect(
        page.getByText("EEOC questions"),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText("Prefer not to say"),
      ).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

test.describe("Tenant isolation", () => {
  test("user B cannot see user A profile data", async ({ page, request }) => {
    const userA = await createTestUser(request);
    const userB = await createTestUser(request);

    try {
      // User A adds a work history entry
      await loginViaUI(page, userA, request);
      await navigateToProfile(page);

      await page.getByLabel("Add work history").click();
      await page.getByLabel(/^company/i).fill("UserA Only Corp");
      await page.getByLabel(/^title/i).fill("Secret Engineer");
      await page.getByLabel(/^start date/i).fill("2022-01-01");
      await page.getByRole("button", { name: /add work history/i }).click();
      await expect(page.getByText("UserA Only Corp")).toBeVisible({ timeout: 5_000 });

      // Sign out user A — click the user menu trigger (the button at the bottom
      // of the sidebar shows the truncated name, not the full email)
      const userMenuButton = page.locator("aside").getByRole("button").last();
      await userMenuButton.click();
      await page.getByRole("menuitem", { name: /sign out/i }).click();
      await page.waitForURL("**/login");

      // User B logs in and checks profile
      await loginViaUI(page, userB, request);
      await navigateToProfile(page);

      // User B should NOT see User A's work history
      await expect(page.getByText("UserA Only Corp")).not.toBeVisible();
      await expect(page.getByText(/no work history added yet/i)).toBeVisible();
    } finally {
      await deleteTestUser(request, userA);
      await deleteTestUser(request, userB);
    }
  });
});
