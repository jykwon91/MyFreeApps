/** A 429 on clicking a draft line: the refinement message in the toast, and the line can be clicked again. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { showError } from "@platform/ui";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import ActiveSessionView from "../ActiveSessionView";
import { makeRefinementSession } from "./makeRefinementSession";

const createTargetFromLine = vi.fn();

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  extractErrorMessage: () => "Too many attempts",
}));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useCreateTargetFromLineMutation: () => [createTargetFromLine, { isLoading: false }],
}));

vi.mock("@/features/resume_refinement/CurrentDraftPanel", () => ({
  default: ({
    highlightText,
    onLineClick,
  }: {
    highlightText: string | null;
    onLineClick?: (line: { text: string; section: string }) => void;
  }) => (
    <div>
      <p data-testid="highlight">{highlightText}</p>
      <button onClick={() => onLineClick?.({ text: "Shipped the app", section: "Experience" })}>pick line</button>
    </div>
  ),
}));

vi.mock("@/features/resume_refinement/ActiveSessionLayout", () => ({
  default: ({ draft }: { draft: ReactNode }) => <div>{draft}</div>,
}));

describe("ActiveSessionView rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTargetFromLine.mockReturnValue({ unwrap: () => Promise.reject({ status: 429, data: { detail: "Too many attempts" } }) });
  });

  it("toasts the refinement message, drops the pending highlight and lets the line be clicked again", async () => {
    render(<ActiveSessionView session={makeRefinementSession({ target_index: 0 })} onStartNew={vi.fn()} />);
    fireEvent.click(screen.getByText("pick line"));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGES.resumeRefinement));
    expect(screen.getByTestId("highlight")).toHaveTextContent("Led the team");

    fireEvent.click(screen.getByText("pick line"));
    await waitFor(() => expect(createTargetFromLine).toHaveBeenCalledTimes(2));
  });
});
