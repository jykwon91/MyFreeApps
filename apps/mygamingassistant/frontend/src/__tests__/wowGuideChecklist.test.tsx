import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BeginnerChecklistSection from "@/games/wow-forever/components/guide/BeginnerChecklistSection";
import { BEGINNER_MISTAKES } from "@/games/wow-forever/data/guide/beginnerMistakes";
import { CHECKLIST_STORAGE_KEY } from "@/games/wow-forever/hooks/useChecklist";

const TOTAL = BEGINNER_MISTAKES.length;
const FIRST = BEGINNER_MISTAKES[0];

describe("New Player Guide checklist", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("has about ten unique items", () => {
    expect(TOTAL).toBeGreaterThanOrEqual(8);
    expect(new Set(BEGINNER_MISTAKES.map((m) => m.id)).size).toBe(TOTAL);
  });

  it("counts ticked items and saves them to localStorage", async () => {
    render(<BeginnerChecklistSection />);
    expect(screen.getByText(`0 of ${TOTAL} done`)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(new RegExp(FIRST.title)));

    expect(screen.getByText(`1 of ${TOTAL} done`)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CHECKLIST_STORAGE_KEY) ?? "[]")).toEqual([FIRST.id]);
  });

  it("restores saved progress, ignoring ids that no longer exist", () => {
    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify([FIRST.id, "retired-item"]));
    render(<BeginnerChecklistSection />);
    expect(screen.getByText(`1 of ${TOTAL} done`)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(FIRST.title))).toBeChecked();
  });

  it("resets progress", async () => {
    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify([FIRST.id]));
    render(<BeginnerChecklistSection />);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(`0 of ${TOTAL} done`)).toBeInTheDocument();
    expect(window.localStorage.getItem(CHECKLIST_STORAGE_KEY)).toBeNull();
  });

  it("still works when localStorage is unavailable or corrupt", async () => {
    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, "{not json");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    render(<BeginnerChecklistSection />);
    await userEvent.click(screen.getByLabelText(new RegExp(FIRST.title)));
    expect(screen.getByText(`1 of ${TOTAL} done`)).toBeInTheDocument();
  });
});
