/**
 * E2E: Data export happy path.
 *
 * Logs in as the shared E2E user, clicks "Download my data", and verifies
 * the downloaded JSON contains the expected top-level keys.
 */
import { test, expect } from "./fixtures/auth";

test.describe("Data export — happy path", () => {
  test("download button triggers a JSON file with expected top-level keys", async ({ authedPage: page }) => {
    await page.goto("/security");
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });

    // Set up a download listener before clicking
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: /download my data/i }).click(),
    ]);

    // Verify the file has a .json suffix
    expect(download.suggestedFilename()).toMatch(/mybookkeeper-export.*\.json/);

    // Read and parse the downloaded content
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const content = Buffer.concat(chunks).toString("utf-8");
    const data = JSON.parse(content) as Record<string, unknown>;

    // Verify the expected top-level keys are present
    expect(data).toHaveProperty("exported_at");
    expect(data).toHaveProperty("user");
    expect(data).toHaveProperty("properties");
    expect(data).toHaveProperty("documents");
    expect(data).toHaveProperty("transactions");
    expect(data).toHaveProperty("integrations");

    // Verify no sensitive fields are present in the raw JSON
    expect(content).not.toContain("hashed_password");
    expect(content).not.toContain("totp_secret");
    expect(content).not.toContain("totp_recovery_codes");
    expect(content).not.toContain("access_token_encrypted");
    expect(content).not.toContain("refresh_token_encrypted");
  });
});
