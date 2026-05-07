/**
 * Smoke + render tests for KanbanBoard.
 *
 * Covers:
 * - Renders all columns + cards with mock data, grouped by latest_event_type
 * - Empty state renders when no items
 * - Closed column collapsed by default
 * - Card click invokes onSelectCard
 *
 * Drag-drop assertions live in ``use-kanban-drag-handler.test.ts`` because
 * dnd-kit's PointerSensor needs real DOM events that jsdom doesn't fire
 * cleanly — testing the pure helpers covers the load-bearing logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { baseApi } from "@platform/ui";
import type { KanbanItem } from "@/types/kanban/kanban-item";

// Force desktop layout so KanbanMobileList isn't picked.
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    useMediaQuery: () => false,
  };
});

vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
  Search: () => null,
}));

// dnd-kit's CJS bundle interacts badly with Vitest's React module
// resolution under monorepo workspaces (the same React 18/19 conflict
// that has previously prevented MBK from migrating to @platform/ui).
// We mock dnd-kit at the test boundary — the pure helper logic in
// ``use-kanban-drag-handler`` is covered by its own unit tests.
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  closestCenter: () => null,
  useSensor: () => null,
  useSensors: () => [],
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: undefined,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

// Inline the KanbanBoard import after the mocks so they take effect.
const { default: KanbanBoard } = await import("../KanbanBoard");

function makeItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    role_title: "Engineer",
    applied_at: null,
    archived: false,
    company_id: "company-1",
    company_name: "Acme",
    company_logo_url: null,
    latest_event_type: "applied",
    stage_entered_at: "2026-05-01T00:00:00Z",
    verdict: null,
    ...overrides,
  };
}

function renderBoard(items: KanbanItem[], onSelectCard = vi.fn()) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  const utils = render(
    <Provider store={store}>
      <MemoryRouter>
        <KanbanBoard items={items} onSelectCard={onSelectCard} />
      </MemoryRouter>
    </Provider>,
  );
  return { ...utils, onSelectCard };
}

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when items list is empty", () => {
    renderBoard([]);
    expect(screen.getByText(/your hunt starts here/i)).toBeInTheDocument();
  });

  it("renders Applied/Interviewing/Offer columns and groups cards by stage", () => {
    const items = [
      makeItem({ id: "a-1", role_title: "Backend role", latest_event_type: "applied" }),
      makeItem({
        id: "i-1",
        role_title: "Frontend role",
        latest_event_type: "interview_scheduled",
      }),
      makeItem({ id: "o-1", role_title: "Director role", latest_event_type: "offer_received" }),
    ];
    renderBoard(items);

    expect(screen.getByLabelText(/Applied column/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Interviewing column/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Offer column/i)).toBeInTheDocument();

    const applied = screen.getByLabelText(/Applied column/i);
    expect(within(applied).getByText("Backend role")).toBeInTheDocument();

    const interviewing = screen.getByLabelText(/Interviewing column/i);
    expect(within(interviewing).getByText("Frontend role")).toBeInTheDocument();
  });

  it("hides the Closed column behind a collapsed accordion by default", async () => {
    const items = [
      makeItem({ id: "x", latest_event_type: "applied" }),
      makeItem({
        id: "c-1",
        role_title: "Rejected role",
        latest_event_type: "rejected",
      }),
    ];
    renderBoard(items);

    // Closed accordion exists but its body is not rendered yet.
    expect(screen.queryByLabelText(/Closed column/i)).not.toBeInTheDocument();

    const accordionButton = screen.getByRole("button", { name: /Closed/i });
    await userEvent.click(accordionButton);

    expect(screen.getByLabelText(/Closed column/i)).toBeInTheDocument();
    expect(screen.getByText("Rejected role")).toBeInTheDocument();
  });

  it("invokes onSelectCard when a card is clicked", async () => {
    const items = [makeItem({ id: "click-1", role_title: "Clickable" })];
    const { onSelectCard } = renderBoard(items);

    // Card renders inside the Applied column.
    const card = screen.getByText("Clickable").closest('[data-kanban-card-id]');
    expect(card).not.toBeNull();
    await userEvent.click(card!);
    expect(onSelectCard).toHaveBeenCalledWith("click-1");
  });
});
