/**
 * Phone-width list: shows the shared verdict label and days-in-stage chip, and
 * each card's Move menu moves it through moveKanbanItem with a toast either way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, useSelector } from "react-redux";
import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { useBoardMove } from "@myjobhunter/api-client/hooks/useBoardMove";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { groupKanbanItems } from "@myjobhunter/api-client/utils/groupKanbanItems";
import KanbanMobileList from "../KanbanMobileList";
import { useBoardMoveFeedback } from "../use-board-move-feedback";

const mocks = vi.hoisted(() => ({
  moveKanbanItem: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/moveKanbanItem", () => ({ moveKanbanItem: mocks.moveKanbanItem }));
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showSuccess: mocks.showSuccess, showError: mocks.showError };
});

const EVENT_FOR_COLUMN: Record<KanbanColumn, string> = {
  applied: "applied",
  interviewing: "interview_scheduled",
  offer: "offer_received",
  closed: "rejected",
};

interface BoardState {
  items: KanbanItem[];
}

/** A one-reducer stand-in for the kanban cache, so a move really changes which stage a card is in. */
const boardSlice = createSlice({
  name: "board",
  initialState: { items: [] } as BoardState,
  reducers: {
    load: (state, action: PayloadAction<KanbanItem[]>) => {
      state.items = action.payload;
    },
    place: (state, action: PayloadAction<{ id: string; column: KanbanColumn }>) => {
      const card = state.items.find((i) => i.id === action.payload.id);
      if (card) card.latest_event_type = EVENT_FOR_COLUMN[action.payload.column];
    },
  },
});

function item(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: "app-1",
    role_title: "Staff Engineer",
    applied_at: null,
    archived: false,
    company_id: "c1",
    company_name: "Acme",
    company_logo_url: null,
    latest_event_type: "applied",
    stage_entered_at: new Date().toISOString(),
    verdict: null,
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function List() {
  const items = useSelector((state: { board: BoardState }) => state.board.items);
  const { notify, announcement, focusId, clearFocus } = useBoardMoveFeedback();
  const { movingIds, moveTo } = useBoardMove({ newKey: () => "key-1", notify });
  return (
    <KanbanMobileList
      itemsByColumn={groupKanbanItems(items)}
      onSelectCard={() => {}}
      movingIds={movingIds}
      onMove={moveTo}
      announcement={announcement}
      focusId={focusId}
      onFocused={clearFocus}
    />
  );
}

function renderList(items: KanbanItem[]) {
  const store = configureStore({ reducer: { board: boardSlice.reducer } });
  store.dispatch(boardSlice.actions.load(items));
  return render(
    <Provider store={store}>
      <List />
    </Provider>,
  );
}

function section(stage: string): HTMLElement {
  const found = screen.getByRole("heading", { name: stage }).closest("section");
  if (!found) throw new Error(`no ${stage} section`);
  return found;
}

const MOVE_BUTTON = /Move Staff Engineer, Acme/;

/** The thunk the real moveKanbanItem is: the card moves at once, and goes back if the server refuses. */
function stubMove(outcome: "agrees" | "refuses"): void {
  mocks.moveKanbanItem.mockImplementation(
    ({ applicationId, target }: { applicationId: string; target: KanbanColumn }) =>
      (
        dispatch: (action: ReturnType<typeof boardSlice.actions.place>) => void,
        getState: () => { board: BoardState },
      ) => {
        const before = getState().board.items.find((i) => i.id === applicationId);
        dispatch(boardSlice.actions.place({ id: applicationId, column: target }));
        if (outcome === "agrees") return Promise.resolve({});
        const back = Object.entries(EVENT_FOR_COLUMN).find(([, event]) => event === before?.latest_event_type)?.[0];
        dispatch(boardSlice.actions.place({ id: applicationId, column: back as KanbanColumn }));
        return Promise.reject(new Error("nope"));
      },
  );
}

describe("KanbanMobileList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMove("agrees");
  });

  it("shows the labelled verdict, not the raw value", () => {
    renderList([item({ verdict: "strong_fit" })]);
    expect(screen.getByText("Strong fit")).toBeInTheDocument();
    expect(screen.queryByText("strong_fit")).not.toBeInTheDocument();
  });

  it("shows a days-in-stage chip once a card has sat a while, and none when fresh", () => {
    renderList([
      item({ id: "old", role_title: "Old card", stage_entered_at: daysAgo(15) }),
      item({ id: "new", role_title: "New card", stage_entered_at: daysAgo(1) }),
    ]);
    const old = screen.getByText("Old card").closest<HTMLElement>("[data-kanban-card-id]")!;
    const fresh = screen.getByText("New card").closest<HTMLElement>("[data-kanban-card-id]")!;
    expect(within(old).getByText(/15\s*d/i)).toBeInTheDocument();
    expect(within(fresh).queryByText(/\dd/i)).not.toBeInTheDocument();
  });

  it("moves a card to the picked stage, confirms with a toast, and keeps focus on its Move button", async () => {
    renderList([item()]);
    await userEvent.click(screen.getByRole("button", { name: MOVE_BUTTON }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Interviewing" }));

    expect(mocks.moveKanbanItem).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "app-1", target: "interviewing", idempotencyKey: "key-1" }),
    );
    expect(mocks.showSuccess).toHaveBeenCalledWith("Moved to Interviewing.");
    expect(mocks.showError).not.toHaveBeenCalled();

    // The card now sits in the Interviewing section, and focus followed it there.
    const moved = within(section("Interviewing")).getByRole("button", { name: MOVE_BUTTON });
    expect(within(section("Applied")).queryByRole("button", { name: MOVE_BUTTON })).toBeNull();
    await waitFor(() => expect(moved).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("Moved Staff Engineer to Interviewing.");
  });

  it("puts a refused card back, says so, and returns focus to it in its old stage", async () => {
    stubMove("refuses");
    renderList([item()]);
    await userEvent.click(screen.getByRole("button", { name: MOVE_BUTTON }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Offer" }));

    expect(mocks.showError).toHaveBeenCalledWith(expect.stringContaining("Couldn't move card"));
    expect(mocks.showSuccess).not.toHaveBeenCalled();
    const back = within(section("Applied")).getByRole("button", { name: MOVE_BUTTON });
    expect(back).toBeEnabled();
    await waitFor(() => expect(back).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't move Staff Engineer to Offer; it was moved back.");
  });

  it("marks the card's current stage in the menu and does nothing when it is picked", async () => {
    renderList([item()]);
    await userEvent.click(screen.getByRole("button", { name: MOVE_BUTTON }));
    const current = await screen.findByRole("menuitemradio", { name: "Applied" });
    expect(current).toHaveAttribute("aria-checked", "true");
    await userEvent.click(current);
    expect(mocks.moveKanbanItem).not.toHaveBeenCalled();
  });

  it("flags the Move button busy while a move is in flight", async () => {
    let finish: () => void = () => {};
    mocks.moveKanbanItem.mockImplementation(() => () => new Promise((resolve) => (finish = () => resolve({}))));
    renderList([item()]);
    await userEvent.click(screen.getByRole("button", { name: MOVE_BUTTON }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Offer" }));
    expect(screen.getByRole("button", { name: MOVE_BUTTON })).toHaveAttribute("aria-busy", "true");
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: MOVE_BUTTON })).toHaveAttribute("aria-busy", "false"));
  });
});
