/**
 * No-backend E2E for removing a skill on the Profile page: the remove button asks first, Keep leaves the
 * skill alone, and confirming sends the delete and takes the skill off the list.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockProfile } from "./fixtures/mockData";

const EMPTY_LIST = { items: [], total: 0 };
const TIMESTAMP = "2026-11-01T00:00:00+00:00";
const SKILL = {
  id: "skill-1",
  user_id: "u1",
  profile_id: "p1",
  name: "TypeScript",
  years_experience: 5,
  category: null,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

async function stubProfile(page: import("@playwright/test").Page): Promise<string[]> {
  const deleted: string[] = [];
  let skills = [SKILL];
  await stubSignedInShell(page, {
    routes: [
      { path: "/profile", body: mockProfile() },
      { path: "/education", body: EMPTY_LIST },
      { path: "/work-history", body: EMPTY_LIST },
      { path: "/screening-answers", body: EMPTY_LIST },
    ],
  });
  await page.route(/\/api\/skills(\/[^/?]+)?(\?|$)/, (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      deleted.push(request.url().split("/").pop() ?? "");
      skills = [];
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(json({ items: skills, total: skills.length }));
  });
  await page.route("**/api/resume-upload-jobs", (route) => route.fulfill(json([])));
  return deleted;
}

test("removing a skill asks first, and Keep leaves it on the profile", async ({ page }) => {
  const deleted = await stubProfile(page);
  await page.goto("/profile");

  const remove = page.getByRole("button", { name: "Remove TypeScript" });
  const box = await remove.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Remove this skill?" });
  await expect(dialog.getByText("TypeScript — It will be taken off your profile.")).toBeVisible();
  expect(deleted).toEqual([]);

  await dialog.getByRole("button", { name: "Keep" }).click();
  await expect(dialog).toBeHidden();
  await expect(remove).toBeVisible();
  expect(deleted).toEqual([]);
});

test("confirming removes the skill", async ({ page }) => {
  const deleted = await stubProfile(page);
  await page.goto("/profile");

  await page.getByRole("button", { name: "Remove TypeScript" }).click();
  await page.getByRole("dialog", { name: "Remove this skill?" }).getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText('Skill "TypeScript" removed', { exact: true })).toBeVisible();
  await expect(page.getByText("No skills added yet")).toBeVisible();
  expect(deleted).toEqual(["skill-1"]);
});
