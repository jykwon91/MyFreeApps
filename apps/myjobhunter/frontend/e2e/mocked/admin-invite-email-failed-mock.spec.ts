/**
 * No-backend E2E for an admin invite whose email could not be sent.
 *
 * invite_email_failed: no invite was created, the dialog stays open, and the
 * same address can be submitted again.
 * invite_email_unconfirmed: the email may have arrived, so the invite is kept;
 * the message says so, the dialog closes and the invite shows in the list.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell, TEST_USER } from "@platform/ui/test-support/mockSession";

const FAILED_MESSAGE = "The invite email couldn't be sent, so no invite was created. Try again in a few minutes.";
const UNCONFIRMED_MESSAGE =
  "The email may have arrived, but we couldn't confirm it. The invite is in the list — cancel it and send again if the recipient says nothing came.";

const INVITE = {
  id: "00000000-0000-0000-0000-0000000000a1",
  email: "retry@example.com",
  status: "pending",
  expires_at: "2099-01-01T00:00:00Z",
  accepted_at: null,
  accepted_by: null,
  created_by: TEST_USER.id,
  created_at: "2026-11-21T00:00:00Z",
};

interface PostAnswer {
  status: number;
  body: unknown;
  keepsInvite: boolean;
}

/** Answers each POST in turn; a GET lists the invite once a POST that kept it has happened. */
async function stubInvites(page: Page, answers: PostAnswer[]): Promise<string[]> {
  const posts: string[] = [];
  let listed: unknown[] = [];
  await page.route(/\/api\/admin\/invites$/, (route) => {
    if (route.request().method() === "GET") return route.fulfill(json(listed));
    const answer = answers[posts.length];
    posts.push(route.request().postData() ?? "");
    if (answer.keepsInvite) listed = [INVITE];
    return route.fulfill(json(answer.body, answer.status));
  });
  return posts;
}

async function openDialogAndSend(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByLabel("Email").fill("retry@example.com");
  await page.getByRole("button", { name: "Send invite" }).click();
}

test("a refused invite email shows why and lets the admin retry the same address", async ({ page }) => {
  await stubSignedInShell(page, { user: { ...TEST_USER, is_superuser: true } });
  const posts = await stubInvites(page, [
    { status: 502, body: { detail: "invite_email_failed" }, keepsInvite: false },
    { status: 201, body: INVITE, keepsInvite: true },
  ]);

  await page.goto("/admin/invites");
  await openDialogAndSend(page);

  await expect(page.getByText(FAILED_MESSAGE, { exact: true })).toBeVisible();
  await expect(page.getByTestId("create-invite-dialog")).toBeVisible();

  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByTestId("create-invite-dialog")).toBeHidden();
  expect(posts).toHaveLength(2);
});

test("an unconfirmed invite email says it may have arrived and keeps the invite in the list", async ({ page }) => {
  await stubSignedInShell(page, { user: { ...TEST_USER, is_superuser: true } });
  const posts = await stubInvites(page, [
    { status: 502, body: { detail: "invite_email_unconfirmed" }, keepsInvite: true },
  ]);

  await page.goto("/admin/invites");
  await openDialogAndSend(page);

  await expect(page.getByText(UNCONFIRMED_MESSAGE, { exact: true })).toBeVisible();
  await expect(page.getByTestId("create-invite-dialog")).toBeHidden();
  await expect(page.getByText("retry@example.com")).toBeVisible();
  expect(posts).toHaveLength(1);
});
