import { describe, expect, it } from "vitest";
import { newlyCompletedResumeJobs } from "../utils/newlyCompletedResumeJobs";
import { resumeUploadJob } from "./support/resumeUploadJob";

const ids = (jobs: { id: string }[]) => jobs.map(({ id }) => id);

describe("newlyCompletedResumeJobs", () => {
  it("finds a job that was still being read and is now complete", () => {
    const previous = [resumeUploadJob({ id: "a", status: "processing" }), resumeUploadJob({ id: "b" })];
    const next = [resumeUploadJob({ id: "a" }), resumeUploadJob({ id: "b" })];
    expect(ids(newlyCompletedResumeJobs(previous, next))).toEqual(["a"]);
  });

  it("counts a job that appeared already complete since the last read", () => {
    expect(ids(newlyCompletedResumeJobs([], [resumeUploadJob({ id: "a" })]))).toEqual(["a"]);
  });

  it("finds nothing when no job changed to complete", () => {
    const previous = [resumeUploadJob({ id: "a", status: "queued" }), resumeUploadJob({ id: "b" })];
    const next = [resumeUploadJob({ id: "a", status: "processing" }), resumeUploadJob({ id: "b" }), resumeUploadJob({ id: "c", status: "failed" })];
    expect(newlyCompletedResumeJobs(previous, next)).toEqual([]);
  });

  it("finds nothing on the first read, when nothing was cached", () => {
    expect(newlyCompletedResumeJobs(undefined, [resumeUploadJob({ id: "a" })])).toEqual([]);
  });
});
