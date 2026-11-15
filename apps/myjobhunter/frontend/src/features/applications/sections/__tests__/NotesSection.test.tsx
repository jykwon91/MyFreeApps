/**
 * Closing the notes section inside the autosave debounce window still saves the
 * edit; if that save fails the user is told on the global toaster, because the
 * section's own status has unmounted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import NotesSection from "../NotesSection";
import { NOTES_MESSAGES } from "@/constants/notes-messages";

const updateMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useUpdateApplicationMutation: () => [updateMock, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showError: (message: string) => showErrorMock(message),
    extractErrorMessage: (err: unknown) => (err as { message?: string }).message ?? "error",
  };
});

function typeAndClose() {
  const { unmount } = render(<NotesSection applicationId="app-1" initialValue="" />);
  fireEvent.change(screen.getByLabelText("Application notes"), { target: { value: "final thought" } });
  unmount();
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("NotesSection closing save", () => {
  beforeEach(() => {
    updateMock.mockReset();
    showErrorMock.mockReset();
  });

  it("toasts the reason when the save made on close fails", async () => {
    updateMock.mockReturnValue({ unwrap: () => Promise.reject(new Error("Server error")) });
    typeAndClose();
    await flush();

    expect(updateMock).toHaveBeenCalledWith({ id: "app-1", patch: { notes: "final thought" } });
    expect(showErrorMock).toHaveBeenCalledWith(`${NOTES_MESSAGES.lastEditNotSaved}: Server error`);
  });

  it("stays quiet when the save made on close succeeds", async () => {
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    typeAndClose();
    await flush();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(showErrorMock).not.toHaveBeenCalled();
  });

  it("toasts the reason when a save already in flight at close fails", async () => {
    vi.useFakeTimers();
    let reject: (err: Error) => void = () => {};
    updateMock.mockReturnValue({ unwrap: () => new Promise((_, r) => { reject = r; }) });
    const { unmount } = render(<NotesSection applicationId="app-1" initialValue="" />);
    fireEvent.change(screen.getByLabelText("Application notes"), { target: { value: "final thought" } });
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    unmount();
    reject(new Error("Server error"));
    await flush();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(showErrorMock).toHaveBeenCalledWith(`${NOTES_MESSAGES.lastEditNotSaved}: Server error`);
  });
});
