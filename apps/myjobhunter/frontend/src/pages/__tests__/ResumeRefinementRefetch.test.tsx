/** A failed poll keeps a loaded session on screen; a gone session or a first-load failure still shows the error view. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ResumeRefinement from "../ResumeRefinement";
import { RESUME_SESSION_STORAGE_KEY } from "@/constants/resume-session-storage";

const query = vi.hoisted(() => ({ value: {} as { currentData?: object; error?: object } }));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useGetRefinementSessionQuery: () => query.value,
}));
vi.mock("@/features/resume_refinement/ActiveSessionView", () => ({ default: () => <div>session in progress</div> }));
vi.mock("@/features/resume_refinement/SessionLoadErrorView", () => ({ default: () => <div>load error view</div> }));
vi.mock("@/features/resume_refinement/SessionLoadingView", () => ({ default: () => <div>loading skeleton</div> }));

describe("ResumeRefinement when a poll fails", () => {
  beforeEach(() => {
    localStorage.setItem(RESUME_SESSION_STORAGE_KEY, "s1");
  });

  it("keeps the session on screen", () => {
    query.value = { currentData: { id: "s1" }, error: { status: 500 } };
    render(<ResumeRefinement />);
    expect(screen.getByText("session in progress")).toBeInTheDocument();
    expect(screen.queryByText("load error view")).not.toBeInTheDocument();
  });

  it("shows the error view when the session is gone", () => {
    query.value = { currentData: { id: "s1" }, error: { status: 404 } };
    render(<ResumeRefinement />);
    expect(screen.getByText("load error view")).toBeInTheDocument();
  });

  it("shows the error view when nothing has loaded", () => {
    query.value = { currentData: undefined, error: { status: 500 } };
    render(<ResumeRefinement />);
    expect(screen.getByText("load error view")).toBeInTheDocument();
  });
});
