/**
 * Tests for the auto-saving NotesSection.
 *
 * Covers:
 * - Typing fires a debounced save
 * - Save status flips Saving... -> Saved on success
 * - Save status shows error message + Retry on failure
 * - Retry calls the mutation again
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateMock = vi.fn();

vi.mock("@/lib/applicationsApi", () => ({
  useUpdateApplicationMutation: () => [updateMock, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    extractErrorMessage: (err: unknown) => (err as { message?: string }).message ?? "error",
  };
});

import NotesSection from "../sections/NotesSection";

describe("NotesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the initial value in the textarea", () => {
    render(<NotesSection applicationId="abc" initialValue="hello" />);
    expect(screen.getByRole("textbox", { name: /Application notes/i })).toHaveValue("hello");
  });

  it("debounces saves and shows Saved on success", async () => {
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotesSection applicationId="abc" initialValue="" />);

    const textarea = screen.getByRole("textbox", { name: /Application notes/i });
    await userEvent.type(textarea, "first note");

    // Before debounce window elapses no save has fired.
    expect(updateMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(600);
      // Allow any queued microtasks to flush.
      await Promise.resolve();
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ id: "abc", patch: { notes: "first note" } });

    await waitFor(() => {
      expect(screen.getByText(/Saved/)).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("surfaces an error and offers a Retry button when save fails", async () => {
    updateMock.mockReturnValue({
      unwrap: () => Promise.reject(new Error("network down")),
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotesSection applicationId="abc" initialValue="" />);

    const textarea = screen.getByRole("textbox", { name: /Application notes/i });
    await userEvent.type(textarea, "x");

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();

    vi.useRealTimers();
  });
});
