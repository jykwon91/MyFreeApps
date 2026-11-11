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
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useUpdateApplicationMutation: () => [updateMock, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    extractErrorMessage: (err: unknown) => (err as { message?: string }).message ?? "error",
  };
});

import { APPLICATION_NOTES_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
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

  it("sends no save while the notes are over the limit, says so, and saves again once they fit", async () => {
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotesSection applicationId="abc" initialValue="" />);

    const textarea = screen.getByRole("textbox", { name: /Application notes/i });
    fireEvent.change(textarea, { target: { value: "😀".repeat(APPLICATION_NOTES_MAX_LENGTH + 1) } });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Keep this to 5,000 characters or fewer.");
    expect(screen.getByText("5,001 / 5,000")).toBeInTheDocument();
    expect(textarea).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(textarea, { target: { value: "😀".repeat(APPLICATION_NOTES_MAX_LENGTH) } });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("drops the result of a save that went out before the text went over the limit", async () => {
    let finish: () => void = () => undefined;
    updateMock.mockReturnValue({ unwrap: () => new Promise<undefined>((resolve) => { finish = () => resolve(undefined); }) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotesSection applicationId="abc" initialValue="" />);

    const textarea = screen.getByRole("textbox", { name: /Application notes/i });
    fireEvent.change(textarea, { target: { value: "fits" } });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    expect(updateMock).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: "x".repeat(APPLICATION_NOTES_MAX_LENGTH + 1) } });
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Keep this to 5,000 characters or fewer.");
    vi.useRealTimers();
  });

  it("ignores a failure of a save that is no longer the latest", async () => {
    let fail: () => void = () => undefined;
    updateMock.mockReturnValue({ unwrap: () => new Promise<undefined>((_, reject) => { fail = () => reject(new Error("network down")); }) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotesSection applicationId="abc" initialValue="" />);

    const textarea = screen.getByRole("textbox", { name: /Application notes/i });
    fireEvent.change(textarea, { target: { value: "fits" } });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    fireEvent.change(textarea, { target: { value: "x".repeat(APPLICATION_NOTES_MAX_LENGTH + 1) } });
    await act(async () => {
      fail();
      await Promise.resolve();
    });

    expect(screen.queryByText(/network down/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("saves an edit still waiting on the debounce when the section closes", () => {
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    const { unmount } = render(<NotesSection applicationId="abc" initialValue="old" />);

    fireEvent.change(screen.getByRole("textbox", { name: /Application notes/i }), { target: { value: "new" } });
    expect(updateMock).not.toHaveBeenCalled();
    unmount();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ id: "abc", patch: { notes: "new" } });
  });

  it("doesn't save on close when nothing changed or the text is over the limit", () => {
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    const first = render(<NotesSection applicationId="abc" initialValue="old" />);
    first.unmount();
    const second = render(<NotesSection applicationId="abc" initialValue="old" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Application notes/i }), {
      target: { value: "x".repeat(APPLICATION_NOTES_MAX_LENGTH + 1) },
    });
    second.unmount();

    expect(updateMock).not.toHaveBeenCalled();
  });
});
