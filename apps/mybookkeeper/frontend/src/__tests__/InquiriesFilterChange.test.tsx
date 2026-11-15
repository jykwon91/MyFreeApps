/**
 * Against the real RTK Query hooks: neither a stage filter nor a spam tab shows the previous
 * filter's inquiries, while it loads or after it failed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inquiries from "@/app/pages/Inquiries";
import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import { restoreApi, stubApi } from "@/test/api-stub";
import { deferred } from "@/test/deferred";
import type { Deferred } from "@/test/types/deferred";
import { renderWithStore } from "@/test/render-with-store";

vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

const NEW_INQUIRY: InquirySummary = {
  id: "inq-1",
  source: "FF",
  listing_id: null,
  stage: "new",
  inquirer_name: "Alice Nguyen",
  inquirer_employer: null,
  desired_start_date: null,
  desired_end_date: null,
  gut_rating: null,
  received_at: "2026-04-25T10:00:00Z",
  spam_status: "clean",
  spam_score: null,
  submitted_via: "manual_entry",
  last_message_preview: null,
  last_message_at: null,
};

const INBOX = { items: [NEW_INQUIRY], total: 1, has_more: false };
const EMPTY = { items: [], total: 0, has_more: false };
const ERROR_MESSAGE = /I couldn't load your inquiries/i;

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

async function openWithFailing(failing: (params: Readonly<Record<string, unknown>>) => boolean) {
  const failed = deferred<unknown>();
  stubApi((path, params) => {
    if (path !== "/inquiries") return EMPTY;
    return failing(params) ? failed.promise : INBOX;
  });
  cleanup = renderWithStore(<Inquiries />, "/inquiries");
  expect((await screen.findAllByText("Alice Nguyen")).length).toBeGreaterThan(0);
  return failed;
}

async function expectSkeletonThenError(failed: Deferred<unknown>) {
  expect(await screen.findByTestId("inquiries-skeleton")).toBeInTheDocument();
  expect(screen.queryByText("Alice Nguyen")).not.toBeInTheDocument();

  failed.reject(new Error("server down"));

  expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText("Alice Nguyen")).not.toBeInTheDocument();
}

describe("Inquiries after a filter change", () => {
  it("drops the previous stage's inquiries while a new stage loads and after it failed", async () => {
    const failed = await openWithFailing((params) => params.stage === "triaged");

    await userEvent.click(screen.getByTestId("inquiry-filter-triaged"));

    await expectSkeletonThenError(failed);
  });

  it("drops the inbox's inquiries while the Spam tab loads and after it failed", async () => {
    const failed = await openWithFailing((params) => params.spam_status === "spam");

    await userEvent.click(screen.getByTestId("inquiry-spam-tab-spam"));

    await expectSkeletonThenError(failed);
  });
});
