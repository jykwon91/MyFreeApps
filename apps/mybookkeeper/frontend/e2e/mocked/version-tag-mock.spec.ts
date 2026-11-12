/**
 * No-backend E2E for the sidebar version tag. The real stack always reports a
 * commit, so the "unknown" build can only be pinned with a mocked /version.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { VERSION_INFO, plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import type { VersionInfo } from "@/shared/types/version/version-info";

async function openApp(page: Page, version: VersionInfo) {
  await plantAuth(page);
  await page.route("**/api/**", (route, request) => route.fulfill(json(request.method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "owner");
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
