import { test, expect } from "./fixtures/auth";
import { BACKEND_URL } from "./fixtures/config";

test.describe("Version display", () => {
  test("GET /version returns commit and timestamp", async ({ api }) => {
    const resp = await api.get(`${BACKEND_URL}/version`);
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    expect(body).toHaveProperty("commit");
    expect(body).toHaveProperty("timestamp");
    expect(body.commit.length).toBeGreaterThan(0);
  });

  test("GET /health includes version field", async ({ api }) => {
    const resp = await api.get(`${BACKEND_URL}/health`);
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    expect(body).toHaveProperty("version");
    expect(body.version.length).toBeGreaterThan(0);
  });

  test("sidebar shows version tag", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const versionTag = page.locator('[data-testid="version-tag"]');
    await expect(versionTag).toBeVisible();

    const text = await versionTag.textContent();
    expect(text).toMatch(/^v\.[a-f0-9]+$/);
  });

  test("version tag displays the same commit as the API", async ({ authedPage: page, api }) => {
    const resp = await api.get(`${BACKEND_URL}/version`);
    const { commit } = await resp.json();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const versionTag = page.locator('[data-testid="version-tag"]');
    await expect(versionTag).toHaveText(`v.${commit}`);
  });
});
