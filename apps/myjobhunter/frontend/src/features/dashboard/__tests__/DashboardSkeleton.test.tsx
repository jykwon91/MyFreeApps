/**
 * The loading skeleton must have the loaded board's shape: the same columns,
 * the same lanes per column, and the Closed bar, with none of the old stat
 * cards, funnel or activity feed.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { baseApi } from "@platform/ui";
import KanbanBoard from "@/features/kanban/KanbanBoard";
import DashboardSkeleton from "../DashboardSkeleton";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";

const media = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useMediaQuery: () => media.isMobile };
});

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
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
}));
vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => "" } } }));

const ITEM: KanbanItem = {
  id: "a-1",
  role_title: "Engineer",
  applied_at: null,
  archived: false,
  company_id: "c1",
  company_name: "Acme",
  company_logo_url: null,
  latest_event_type: "applied",
  stage_entered_at: "2026-05-01T00:00:00Z",
  verdict: null,
};

function wrap(node: React.ReactNode) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  return (
    <Provider store={store}>
      <MemoryRouter>{node}</MemoryRouter>
    </Provider>
  );
}

describe("DashboardSkeleton", () => {
  it("mirrors the desktop board: header, three columns, two lanes each, Closed bar", () => {
    media.isMobile = false;
    const { container: loaded } = render(wrap(<KanbanBoard items={[ITEM]} onSelectCard={() => {}} />));
    const loadedColumns = loaded.querySelectorAll("[data-kanban-column]").length;
    const loadedLanes = screen.getAllByRole("button", { name: /lane$/i }).length;
    const loadedClosed = screen.getAllByRole("button", { name: /closed/i }).length;
    const loadedHeading = screen.getByRole("heading", { level: 1 }).textContent;

    const { container: skeleton } = render(<DashboardSkeleton />);
    expect(skeleton.querySelectorAll("[data-skeleton-column]")).toHaveLength(loadedColumns);
    expect(skeleton.querySelectorAll("[data-skeleton-lane]")).toHaveLength(loadedLanes);
    expect(skeleton.querySelectorAll("[data-skeleton-card]").length).toBeGreaterThan(0);
    expect(skeleton.querySelector("h1")?.textContent).toBe(loadedHeading);
    expect(skeleton.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(loadedClosed).toBe(1);
  });

  it("draws no stat cards, funnel chart or activity feed", () => {
    media.isMobile = false;
    const { container } = render(<DashboardSkeleton />);
    expect(container.querySelector(".h-\\[280px\\]")).toBeNull();
    expect(container.querySelector(".sm\\:grid-cols-3")).toBeNull();
  });

  it("mirrors the phone list: sections and each card's logo-less select area plus Move button", () => {
    media.isMobile = true;
    const { container: loaded } = render(wrap(<KanbanBoard items={[ITEM]} onSelectCard={() => {}} />));
    const loadedSections = loaded.querySelectorAll("section").length;
    const loadedCard = loaded.querySelector("[data-kanban-card-id]")!;
    const loadedMoves = within(loadedCard as HTMLElement).getAllByRole("button");
    const loadedLogos = loadedCard.querySelectorAll("img, .rounded-full").length;

    const { container: skeleton } = render(<DashboardSkeleton />);
    expect(skeleton.querySelectorAll("[data-skeleton-column]")).toHaveLength(loadedSections);
    const cards = skeleton.querySelectorAll("[data-skeleton-card]");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      // The same parts as the loaded card: a 44px open area and one Move button, no logo.
      expect(card.querySelectorAll("[data-skeleton-open].min-h-\\[44px\\]")).toHaveLength(1);
      expect(card.querySelectorAll("[data-skeleton-move]")).toHaveLength(1);
      expect(card.querySelectorAll(".rounded-full")).toHaveLength(loadedLogos);
    }
    // Open button + Move button on the loaded card, so two controls to mirror.
    expect(loadedMoves).toHaveLength(2);
  });
});
