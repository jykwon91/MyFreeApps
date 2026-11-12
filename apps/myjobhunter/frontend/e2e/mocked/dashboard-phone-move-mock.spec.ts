/**
 * No-backend E2E at phone width: the dashboard's stage list has a Move menu
 * per card. A successful move shows the card under its new stage with a
 * success toast; a refused move (500) puts the card back with an error toast.
 */
import { test, expect, devices, type Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const KANBAN_ENDPOINT = /\/api\/applications\?view=kanban/;
const TRANSITION_ENDPOINT = /\/api\/applications\/[^/]+\/transitions/;

test.use({ viewport: devices["iPhone 13"].viewport });

interface Board {
  latestEventType: string;
}

async function mockBoard(page: Page, board: Board, transition: (board: Board) => { status: number; body: unknown }) {
  await stubSignedInShell(page);
  await page.route(KANBAN_ENDPOINT, (route) =>
    route.fulfill(
      json({
        items: [
          {
            id: "a1",
            role_title: "Staff Engineer",
            applied_at: null,
            archived: false,
            company_id: "c1",
            company_name: "Acme",
            company_logo_url: null,
            latest_event_type: board.latestEventType,
            stage_entered_at: "2026-11-01T00:00:00+00:00",
            verdict: null,
          },
        ],
      }),
    ),
  );
  await page.route(TRANSITION_ENDPOINT, (route) => {
    const { status, body } = transition(board);
    return route.fulfill(json(body, status));
  });
}

function stage(page: Page, name: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function moveTo(page: Page, stageName: string) {
  await page.getByRole("button", { name: "Move Staff Engineer, Acme" }).click();
  await page.getByRole("menuitemradio", { name: stageName }).click();
}

test("moving a card on the phone list shows it in the new stage with a success toast", async ({ page }) => {
  const board: Board = { latestEventType: "applied" };
  await mockBoard(page, board, (b) => {
    b.latestEventType = "interview_scheduled";
    return { status: 201, body: { id: "e1" } };
  });

  await page.goto("/dashboard");
  await expect(stage(page, "Applied").getByText("Staff Engineer")).toBeVisible();
  await moveTo(page, "Interviewing");

  await expect(stage(page, "Interviewing").getByText("Staff Engineer")).toBeVisible();
  await expect(stage(page, "Applied").getByText("Staff Engineer")).toHaveCount(0);
  await expect(page.getByText("Moved to Interviewing.", { exact: true })).toBeVisible();
  await expect(stage(page, "Interviewing").getByRole("button", { name: "Move Staff Engineer, Acme" })).toBeFocused();
});

test("a refused move puts the card back and shows an error toast", async ({ page }) => {
  await mockBoard(page, { latestEventType: "applied" }, () => ({ status: 500, body: { detail: "boom" } }));

  await page.goto("/dashboard");
  await moveTo(page, "Offer");

  await expect(page.getByText(/Couldn.t move card/).first()).toBeVisible();
  await expect(stage(page, "Applied").getByText("Staff Engineer")).toBeVisible();
  await expect(stage(page, "Offer").getByText("Staff Engineer")).toHaveCount(0);
});
