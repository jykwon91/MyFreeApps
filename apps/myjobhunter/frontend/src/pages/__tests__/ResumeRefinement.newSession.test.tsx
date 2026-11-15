/** After "Start new", the previous session is never on screen while the new one loads. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumeRefinement from "../ResumeRefinement";
import { RESUME_SESSION_STORAGE_KEY } from "@/constants/resume-session-storage";

const OLD_SESSION = { id: "old" };

// Like RTK Query: `data` keeps the last session after the id changes or is skipped; `currentData`
// only has what belongs to the id asked for.
vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useGetRefinementSessionQuery: (id: string) => ({
    data: OLD_SESSION,
    currentData: id === "old" ? OLD_SESSION : undefined,
    // RTK only reports isLoading for a query with no data yet; here the old data is still held.
    isLoading: false,
    error: undefined,
  }),
}));

vi.mock("@/features/resume_refinement/ActiveSessionView", () => ({
  default: ({ session, onStartNew }: { session: { id: string }; onStartNew: () => void }) => (
    <button onClick={onStartNew}>session {session.id}</button>
  ),
}));
vi.mock("@/features/resume_refinement/NoSessionView", () => ({
  default: ({ onSessionStarted }: { onSessionStarted: (id: string) => void }) => (
    <button onClick={() => onSessionStarted("new")}>begin</button>
  ),
}));
vi.mock("@/features/resume_refinement/SessionLoadingView", () => ({ default: () => <div>loading skeleton</div> }));

describe("ResumeRefinement after Start new", () => {
  beforeEach(() => {
    localStorage.setItem(RESUME_SESSION_STORAGE_KEY, "old");
  });

  it("never renders the old session while the new one loads", async () => {
    render(<ResumeRefinement />);
    await userEvent.click(screen.getByText("session old"));
    await userEvent.click(screen.getByText("begin"));

    expect(screen.getByText("loading skeleton")).toBeInTheDocument();
    expect(screen.queryByText("session old")).not.toBeInTheDocument();
  });
});
