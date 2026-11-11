import { describe, expect, it } from "vitest";
import { RESUME_EXPORT_MIME_TYPES } from "../constants/resumeExportMimeTypes";
import { ExportFormat } from "../types/resume-refinement/export-format";
import { completedResumeJobs } from "../utils/completedResumeJobs";
import { formatShortDate } from "../utils/formatShortDate";
import { resumeExportFileName } from "../utils/resumeExportFileName";
import { resumeExportPath } from "../utils/resumeExportPath";
import { resumeJobFileName } from "../utils/resumeJobFileName";
import { resumeJobSummary } from "../utils/resumeJobSummary";
import { resumeUploadJob } from "./support/resumeUploadJob";

const job = resumeUploadJob;

describe("resume upload choices", () => {
  it("keeps only the uploads that finished parsing", () => {
    expect(completedResumeJobs([job(), job({ id: "j2", status: "failed" })]).map(({ id }) => id)).toEqual(["j1"]);
    expect(completedResumeJobs(undefined)).toEqual([]);
  });

  it("names and sums up each upload", () => {
    const date = formatShortDate("2026-10-20T12:00:00Z");
    expect(resumeJobSummary(job())).toBe(`1 role, 12 skills · uploaded ${date}`);
    expect(resumeJobSummary(job({ result_parsed_fields: null }))).toBe(`Parsed resume · uploaded ${date}`);
    expect(resumeJobFileName(job())).toBe("ada.pdf");
    expect(resumeJobFileName(job({ file_filename: null }))).toBe("resume");
  });
});

describe("resume downloads", () => {
  it("builds the export path, file name and content type for each format", () => {
    expect(resumeExportPath("a/b", ExportFormat.DOCX)).toBe("/resume-refinement/sessions/a%2Fb/export?format=docx");
    expect(resumeExportFileName(ExportFormat.PDF)).toBe("resume.pdf");
    expect(RESUME_EXPORT_MIME_TYPES[ExportFormat.PDF]).toBe("application/pdf");
  });
});
