/** A resume list that failed to load is not "no resume uploaded": the panel says so and retries. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SessionStartPanel from "../SessionStartPanel";

const { listQuery, refetch } = vi.hoisted(() => ({
  listQuery: { value: {} as Record<string, unknown> },
  refetch: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/resumesApi", () => ({
  useListResumeJobsQuery: () => ({ ...listQuery.value, refetch }),
  resumesApi: { endpoints: { listResumeJobs: { useQueryState: () => ({ data: undefined }) } } },
}));
vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useStartRefinementSessionMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/features/resume_refinement/ResumeJobOption", () => ({ default: () => <div>pick resume</div> }));

function renderPanel() {
  render(<MemoryRouter><SessionStartPanel onSessionStarted={vi.fn()} /></MemoryRouter>);
}

describe("SessionStartPanel when the resume list fails to load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not tell the user to upload a resume, and retries", () => {
    listQuery.value = { data: undefined, isLoading: false, isError: true, isFetching: false };
    renderPanel();

    expect(screen.queryByText("Upload a resume first")).not.toBeInTheDocument();
    expect(screen.queryByText("Go to Profile")).not.toBeInTheDocument();
    expect(screen.getByText("We couldn't load your resumes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the resumes on screen when a later refresh fails", () => {
    listQuery.value = { data: [{ id: "job-1", status: "complete" }], isLoading: false, isError: true, isFetching: false };
    renderPanel();
    expect(screen.getByText("pick resume")).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your resumes")).not.toBeInTheDocument();
  });

  it("still asks for an upload when the list loaded empty", () => {
    listQuery.value = { data: [], isLoading: false, isError: false, isFetching: false };
    renderPanel();
    expect(screen.getByText("Upload a resume first")).toBeInTheDocument();
  });
});
