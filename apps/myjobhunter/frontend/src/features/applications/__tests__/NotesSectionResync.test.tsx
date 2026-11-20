/**
 * The notes box follows the server value whenever there is no edit of its own to protect —
 * including after its own save — and never overwrites an unsaved or in-flight edit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const updateMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useUpdateApplicationMutation: () => [updateMock, { isLoading: false }],
}));

import NotesSection from "../sections/NotesSection";

const SAVE_WINDOW_MS = 600;

function notesBox(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: /Application notes/i });
}

async function typeAndSettle(text: string) {
  fireEvent.change(notesBox(), { target: { value: text } });
  await act(async () => {
    vi.advanceTimersByTime(SAVE_WINDOW_MS);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("NotesSection re-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows notes changed elsewhere after this box has saved", async () => {
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    const { rerender } = render(<NotesSection applicationId="a" initialValue="old" />);
    await typeAndSettle("from web");
    expect(screen.getByText("Saved")).toBeInTheDocument();

    rerender(<NotesSection applicationId="a" initialValue="from phone" />);
    expect(notesBox()).toHaveValue("from phone");
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite an edit that has not been saved yet", () => {
    const { rerender } = render(<NotesSection applicationId="a" initialValue="old" />);
    fireEvent.change(notesBox(), { target: { value: "typing now" } });

    rerender(<NotesSection applicationId="a" initialValue="from phone" />);
    expect(notesBox()).toHaveValue("typing now");
  });

  it("does not overwrite an edit while its save is in flight", async () => {
    updateMock.mockReturnValue({ unwrap: () => new Promise(() => undefined) });
    const { rerender } = render(<NotesSection applicationId="a" initialValue="old" />);
    await typeAndSettle("saving this");
    expect(screen.getByText(/Saving/)).toBeInTheDocument();

    rerender(<NotesSection applicationId="a" initialValue="from phone" />);
    expect(notesBox()).toHaveValue("saving this");
  });
});
