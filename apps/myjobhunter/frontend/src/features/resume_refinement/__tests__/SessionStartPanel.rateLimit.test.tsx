/** A 429 on Start: the refinement message in the toast, and Start works again. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { showError } from "@platform/ui";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import SessionStartPanel from "../SessionStartPanel";

const startSession = vi.fn();

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  extractErrorMessage: () => "Too many attempts",
}));

vi.mock("@myjobhunter/api-client/store/resumesApi", () => ({
  useListResumeJobsQuery: () => ({ data: [{ id: "job-1", status: "complete" }], isLoading: false }),
}));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useStartRefinementSessionMutation: () => [startSession, { isLoading: false }],
}));

vi.mock("@/features/resume_refinement/ResumeJobOption", () => ({
  default: ({ onSelect }: { onSelect: () => void }) => <button onClick={onSelect}>pick resume</button>,
}));

describe("SessionStartPanel rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startSession.mockReturnValue({ unwrap: () => Promise.reject({ status: 429, data: { detail: "Too many attempts" } }) });
  });

  it("toasts the refinement message and Start can be pressed again", async () => {
    render(<MemoryRouter><SessionStartPanel onSessionStarted={vi.fn()} /></MemoryRouter>);
    await userEvent.click(screen.getByText("pick resume"));
    const start = screen.getByRole("button", { name: "Start refinement" });
    await userEvent.click(start);

    await waitFor(() => expect(showError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGES.resumeRefinement));
    await userEvent.click(start);
    expect(startSession).toHaveBeenCalledTimes(2);
  });
});
