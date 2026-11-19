/**
 * Against the real RTK Query hook and a server stub that refuses a limit above its cap: the welcome
 * manuals list loads past the cap one page at a time, and keeps its rows through a failed "Load more",
 * whose Retry asks for that page again.
 */
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeManuals from "@/app/pages/WelcomeManuals";
import type { WelcomeManualSummary } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-summary";
import { restoreApi, stubApi } from "@/test/api-stub";
import { answerListPage, SERVER_LIMIT_CAP } from "@/test/paged-list-server";
import { renderWithStore } from "@/test/render-with-store";

const PAGE_SIZE = 25;
/** More rows than the server answers in one request, so reaching the last needs offset paging. */
const ROW_COUNT = SERVER_LIMIT_CAP + 30;
const WHEN = "2026-01-01T00:00:00Z";

function manual(index: number): WelcomeManualSummary {
  return { id: `m-${index}`, title: `Guide ${index}`, property_id: null, section_count: 1, created_at: WHEN, updated_at: WHEN };
}

const MANUALS = Array.from({ length: ROW_COUNT }, (_, i) => manual(i + 1));

/** Answers everything but the list (the panels around it) with nothing. */
function answerOther(path: string): unknown {
  return path === "/properties" ? [] : { items: [], total: 0, has_more: false };
}

async function expectRow(title: string): Promise<void> {
  expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
}

async function clickLoadMore(): Promise<void> {
  await userEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]);
}

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

describe("Welcome manuals paging", () => {
  it("loads past the server's limit cap one page at a time, until the last manual", async () => {
    const requests: Array<Readonly<Record<string, unknown>>> = [];
    stubApi((path, params) => {
      if (path !== "/welcome-manuals") return answerOther(path);
      requests.push(params);
      return answerListPage(MANUALS, params);
    });
    cleanup = renderWithStore(<WelcomeManuals />, "/welcome-manuals");
    await expectRow("Guide 1");

    for (let shown = PAGE_SIZE; shown < ROW_COUNT; shown += PAGE_SIZE) {
      await clickLoadMore();
      await expectRow(`Guide ${Math.min(shown + PAGE_SIZE, ROW_COUNT)}`);
    }

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
    expect(requests.map((params) => Number(params.offset))).toEqual([0, 25, 50, 75, 100, 125]);
    expect(requests.every((params) => Number(params.limit) === PAGE_SIZE)).toBe(true);
  });

  it("keeps its manuals when 'Load more' fails, and Retry loads that page", async () => {
    let failSecondPage = true;
    stubApi((path, params) => {
      if (path !== "/welcome-manuals") return answerOther(path);
      if (Number(params.offset) === PAGE_SIZE && failSecondPage) {
        failSecondPage = false;
        throw new Error("server down");
      }
      return answerListPage(MANUALS, params);
    });
    cleanup = renderWithStore(<WelcomeManuals />, "/welcome-manuals");
    await expectRow("Guide 1");

    await clickLoadMore();

    expect(await screen.findByText("I couldn't load more welcome manuals. Want me to try again?")).toBeInTheDocument();
    await expectRow("Guide 1");
    expect(screen.queryByTestId("welcome-manuals-skeleton")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await expectRow(`Guide ${PAGE_SIZE + 1}`);
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });
});
