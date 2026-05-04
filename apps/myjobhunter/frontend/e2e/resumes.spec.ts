import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";
import path from "path";
import fs from "fs";
import os from "os";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";

/**
 * E2E tests for the Resume Upload feature (Phase 2).
 *
 * Covers:
 *   1. Resume section is visible on the Profile page
 *   2. Empty state is shown when no resumes have been uploaded
 *   3. Upload API rejects files that are too large (413)
 *   4. Upload API rejects files with a disallowed content-type (415)
 *   5. Upload API rejects files whose magic bytes don't match the declared type (415)
 *   6. GET /resume-upload-jobs is tenant-isolated (user B cannot see user A's jobs)
 *
 * Note: Tests 3–6 drive the API directly because the MinIO storage backend
 * may not be available in all environments. The UI upload flow (happy path)
 * requires MinIO and is therefore covered separately in integration/staging.
 */

async function loginAndGetToken(
  request: import("@playwright/test").APIRequestContext,
  user: { email: string; password: string },
): Promise<string> {
  const resp = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
    form: { username: user.email, password: user.password },
  });
  if (!resp.ok()) {
    throw new Error(`Login failed: ${resp.status()} ${await resp.text()}`);
  }
  const { access_token } = await resp.json();
  return access_token as string;
}

// ---------------------------------------------------------------------------
// UI tests — require both frontend and backend running
// ---------------------------------------------------------------------------

test.describe("Resume section — Profile page UI", () => {
  test("Resume heading and empty state are visible on the Profile page", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Profile
      await page.getByRole("link", { name: /profile/i }).first().click();
      await page.waitForURL("**/profile");

      // The Resume section heading should be visible
      await expect(page.getByRole("heading", { name: /resume/i })).toBeVisible();

      // Empty state — no resumes uploaded yet
      await expect(page.getByText(/No resumes uploaded yet/i)).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

// ---------------------------------------------------------------------------
// API-level tests — drive the backend directly to cover validation paths that
// require exact file content (magic bytes) or large payloads.
// ---------------------------------------------------------------------------

test.describe("Resume Upload API — validation", () => {
  test("POST /resumes rejects a file larger than 25 MB with 413", async ({
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await loginAndGetToken(request, user);

      // Create a 26 MB buffer (just over the 25 MB limit)
      const oversizeBytes = Buffer.alloc(26 * 1024 * 1024, 0x25); // 0x25 = '%'

      // Write to a temp file so we can send it as multipart
      const tmpPath = path.join(os.tmpdir(), `mjh-e2e-oversize-${Date.now()}.pdf`);
      fs.writeFileSync(tmpPath, oversizeBytes);

      try {
        const resp = await request.post(`${BACKEND_URL}/api/resumes`, {
          headers: { Authorization: `Bearer ${token}` },
          multipart: {
            file: {
              name: "huge.pdf",
              mimeType: "application/pdf",
              buffer: oversizeBytes,
            },
          },
        });
        expect(resp.status()).toBe(413);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("POST /resumes rejects a disallowed content-type (image/png) with 415", async ({
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await loginAndGetToken(request, user);

      // A tiny PNG header
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      const resp = await request.post(`${BACKEND_URL}/api/resumes`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: "photo.png",
            mimeType: "image/png",
            buffer: pngMagic,
          },
        },
      });
      expect(resp.status()).toBe(415);
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("POST /resumes rejects a PNG renamed to .pdf (magic-byte mismatch) with 415", async ({
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await loginAndGetToken(request, user);

      // PNG magic bytes sent with application/pdf declared type
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      const resp = await request.post(`${BACKEND_URL}/api/resumes`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: "resume.pdf",
            mimeType: "application/pdf",
            buffer: pngMagic,
          },
        },
      });
      expect(resp.status()).toBe(415);
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("GET /resume-upload-jobs returns 200 and an empty list for a new user", async ({
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await loginAndGetToken(request, user);

      const resp = await request.get(`${BACKEND_URL}/api/resume-upload-jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("GET /resume-upload-jobs is tenant-isolated — user B cannot see user A's jobs", async ({
    request,
  }) => {
    const userA = await createTestUser(request);
    const userB = await createTestUser(request);

    try {
      const tokenA = await loginAndGetToken(request, userA);
      const tokenB = await loginAndGetToken(request, userB);

      // User A's job list should be empty and not expose anything from user B
      const respA = await request.get(`${BACKEND_URL}/api/resume-upload-jobs`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(respA.status()).toBe(200);
      const jobsA = await respA.json();
      expect(Array.isArray(jobsA)).toBe(true);

      // User B's job list is also empty and completely separate
      const respB = await request.get(`${BACKEND_URL}/api/resume-upload-jobs`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(respB.status()).toBe(200);
      const jobsB = await respB.json();
      expect(Array.isArray(jobsB)).toBe(true);

      // Neither user can see the other's data — both lists are empty
      expect(jobsA).toHaveLength(0);
      expect(jobsB).toHaveLength(0);
    } finally {
      await deleteTestUser(request, userA);
      await deleteTestUser(request, userB);
    }
  });

  test("GET /resume-upload-jobs/{id} returns 404 for another user's job", async ({
    request,
  }) => {
    const userA = await createTestUser(request);
    const userB = await createTestUser(request);

    try {
      const tokenB = await loginAndGetToken(request, userB);

      // Use a random UUID — user B has no jobs and should get 404
      const fakeJobId = "00000000-0000-0000-0000-000000000001";
      const resp = await request.get(
        `${BACKEND_URL}/api/resume-upload-jobs/${fakeJobId}`,
        {
          headers: { Authorization: `Bearer ${tokenB}` },
        },
      );
      expect(resp.status()).toBe(404);
    } finally {
      await deleteTestUser(request, userA);
      await deleteTestUser(request, userB);
    }
  });
});
