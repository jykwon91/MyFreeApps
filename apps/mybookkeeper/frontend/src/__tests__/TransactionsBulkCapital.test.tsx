/** Marking the ticked transactions as capital improvements from the bulk bar. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage, requests, resetServer, stopServer, TOTAL } from "@/test/transactions-page-harness";
import {
  CAPITAL_IMPROVEMENT_LABEL,
  MARK_CAPITAL_IMPROVEMENT,
  UNMARK_CAPITAL_IMPROVEMENT,
} from "@mybookkeeper/api-client/constants/capitalImprovementLabels";

vi.mock("@/shared/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

const box = (n: number) => screen.getByRole("checkbox", { name: `Select Row ${n}` });
const rowOf = (n: number) => box(n).closest("tr") as HTMLElement;
const sent = () => requests.filter((r) => r.path === "/transactions/bulk-capital-improvement");

beforeEach(() => {
  resetServer();
});

afterEach(() => {
  stopServer();
});

describe("Bulk capital improvement", () => {
  it("marks the ticked rows, labels them and clears the ticks", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1\u201325 of ${TOTAL}`);

    await user.click(box(1));
    await user.click(box(2));
    await user.click(screen.getByRole("button", { name: MARK_CAPITAL_IMPROVEMENT }));

    await waitFor(() => expect(within(rowOf(1)).getByText(CAPITAL_IMPROVEMENT_LABEL)).toBeInTheDocument());
    expect(within(rowOf(2)).getByText(CAPITAL_IMPROVEMENT_LABEL)).toBeInTheDocument();
    expect(within(rowOf(3)).queryByText(CAPITAL_IMPROVEMENT_LABEL)).not.toBeInTheDocument();
    expect(sent()).toHaveLength(1);
    expect(sent()[0].body).toMatchObject({ is_capital_improvement: true });
    expect(box(1)).not.toBeChecked();
  });

  it("unmarks the ticked rows", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`1\u201325 of ${TOTAL}`);
    await user.click(box(1));
    await user.click(screen.getByRole("button", { name: MARK_CAPITAL_IMPROVEMENT }));
    await waitFor(() => expect(within(rowOf(1)).getByText(CAPITAL_IMPROVEMENT_LABEL)).toBeInTheDocument());

    await user.click(box(1));
    await user.click(screen.getByRole("button", { name: UNMARK_CAPITAL_IMPROVEMENT }));

    await waitFor(() => expect(within(rowOf(1)).queryByText(CAPITAL_IMPROVEMENT_LABEL)).not.toBeInTheDocument());
    expect(sent()[1].body).toMatchObject({ is_capital_improvement: false });
  });
});
