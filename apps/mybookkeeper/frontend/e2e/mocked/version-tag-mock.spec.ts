/**
 * No-backend E2E for the sidebar version tag. The real stack always reports a
 * commit, so the "unknown" build can only be pinned with a mocked /version.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { VERSION_INFO, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import type { VersionInfo } from "@/shared/types/version/version-info";

async function openApp(page: Page, version: VersionInfo) {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/version", (route) => route.fulfill(json(version)));
  const versionLoaded = page.waitForResponse("**/api/version");
  await page.goto("/");
  await versionLoaded;
  await expect(page.getByRole("navigation").first()).toBeVisible();
}

test("shows the build commit in the sidebar", async ({ page }) => {
  await openApp(page, VERSION_INFO);
  await expect(page.getByTestId("version-tag")).toHaveText(`v.${VERSION_INFO.commit}`);
});

test("hides the tag when the build commit is unknown", async ({ page }) => {
  await openApp(page, { commit: "unknown", timestamp: VERSION_INFO.timestamp });
  await expect(page.getByTestId("version-tag")).toHaveCount(0);
});
