/**
 * No-backend E2E for the Profile page's remote-preference buttons: while a save is in flight the
 * chosen button shows saving and the group is switched off, so a second click can't send a second
 * save; a toast confirms the save, and a failed save puts the old choice back with an error toast.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockProfile } from "./fixtures/mockData";

const EMPTY_LIST = { items: [], total: 0 };

async function openProfile(page: Parameters<typeof stubSignedInShell>[0]) {
  await stubSignedInShell(page, {
    routes: [
      { path: "/education", body: EMPTY_LIST },
      { path: "/skills", body: EMPTY_LIST },
      { path: "/screening-answers", body: EMPTY_LIST },
      { path: "/work-history", body: EMPTY_LIST },
      { path: "/resume-upload-jobs", body: [] },
    ],
  });
}

test("the remote preference shows saving, waits for the save, then confirms it", async ({ page }) => {
  let saves = 0;
  let saved = "any";
  let finishSave: () => void = () => undefined;
  const saveFinished = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await openProfile(page);
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PATCH") {
      saves += 1;
      await saveFinished;
      saved = "hybrid";
    }
    return route.fulfill(json(mockProfile({ remote_preference: saved })));
  });

  await page.goto("/profile");
  const group = page.getByRole("group", { name: "Remote preference" });
  await group.getByRole("button", { name: "Hybrid" }).click();

  await expect(group.getByRole("button", { name: "Saving…" })).toBeDisabled();
  for (const button of await group.getByRole("button").all()) await expect(button).toBeDisabled();
  expect(saves).toBe(1);

  finishSave();
  await expect(page.getByText("Remote preference saved.", { exact: true })).toBeVisible();
  await expect(group.getByRole("button", { name: "Hybrid" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "Hybrid" })).toBeEnabled();
});

test("a failed remote preference save keeps the old choice and says so", async ({ page }) => {
  await openProfile(page);
  await page.route("**/api/profile", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill(json({ detail: "nope" }, 422))
      : route.fulfill(json(mockProfile())),
  );

  await page.goto("/profile");
  const group = page.getByRole("group", { name: "Remote preference" });
  await group.getByRole("button", { name: "Hybrid" }).click();

  await expect(page.getByText("I couldn't save your remote preference. Want to try again?", { exact: true })).toBeVisible();
  await expect(group.getByRole("button", { name: "Open to all" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "Hybrid" })).toBeEnabled();
});
