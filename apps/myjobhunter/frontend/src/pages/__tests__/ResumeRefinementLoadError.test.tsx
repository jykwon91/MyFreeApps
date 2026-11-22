/** The page tells the error view whether the session is gone and lets it refetch. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ResumeRefinement from "../ResumeRefinement";
import { RESUME_SESSION_STORAGE_KEY } from "@/constants/resume-session-storage";

const { query, refetch } = vi.hoisted(() => ({ query: { value: {} as { error?: object } }, refetch: vi.fn() }));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useGetRefinementSessionQuery: () => ({ currentData: undefined, isFetching: false, refetch, ...query.value }),
}));
vi.mock("@/features/resume_refinement/SessionLoadErrorView", () => ({
  default: ({ isGone, onRetry }: { isGone: boolean; onRetry: () => void }) => (
    <button onClick={onRetry}>{isGone ? "gone" : "failed"}</button>
  ),
}));

describe("ResumeRefinement when the first load fails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(RESUME_SESSION_STORAGE_KEY, "s1");
  });

  it("treats a network failure as retryable and keeps the saved session id", () => {
    query.value = { error: { status: 500 } };
    render(<ResumeRefinement />);
    fireEvent.click(screen.getByText("failed"));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(RESUME_SESSION_STORAGE_KEY)).toBe("s1");
  });

  it("treats a 404 as gone", () => {
    query.value = { error: { status: 404 } };
    render(<ResumeRefinement />);
    expect(screen.getByText("gone")).toBeInTheDocument();
  });
});
