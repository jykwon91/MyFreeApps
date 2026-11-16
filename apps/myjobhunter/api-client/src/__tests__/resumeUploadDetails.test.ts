import { describe, expect, it } from "vitest";
import type { ParseProvenanceEntry } from "../types/resume-upload-job/parse-provenance-entry";
import { formatDateTime } from "../utils/formatDateTime";
import { parseProvenanceFlags } from "../utils/parseProvenanceFlags";
import { parseProvenanceHeadline } from "../utils/parseProvenanceHeadline";
import { parseProvenancePlace } from "../utils/parseProvenancePlace";
import { resumeJobMeta } from "../utils/resumeJobMeta";
import { resumeJobParsedResults } from "../utils/resumeJobParsedResults";
import { resumeParsedCounts } from "../utils/resumeParsedCounts";
import { resumeUploadJob } from "./support/resumeUploadJob";

const job = resumeUploadJob;
const FLAG: ParseProvenanceEntry = { kind: "work_bullet", company: "Acme", text: "Grew revenue 300%", unsourced_terms: ["300%"] };

describe("an upload's time and size", () => {
  it("shows when it came in and the file's size, leaving out only an unknown size", () => {
    const when = formatDateTime("2026-10-20T12:00:00Z");
    expect(resumeJobMeta(job({ file_size_bytes: 1536 }))).toBe(`${when} · 1.5 KB`);
    expect(resumeJobMeta(job({ file_size_bytes: 0 }))).toBe(`${when} · 0 B`);
    expect(resumeJobMeta(job({ file_size_bytes: null }))).toBe(when);
  });
});

describe("what was read from an upload", () => {
  it("is only there for a finished upload that has it", () => {
    expect(resumeJobParsedResults(job())).toEqual(job().result_parsed_fields);
    expect(resumeJobParsedResults(job({ result_parsed_fields: null }))).toBeNull();
    for (const status of ["queued", "processing", "failed", "cancelled"] as const) {
      expect(resumeJobParsedResults(job({ status }))).toBeNull();
    }
  });

  it("counts roles, education and skills with the noun matching each count", () => {
    expect(resumeParsedCounts({ work_history_count: 1, education_count: 1, skills_count: 1 })).toEqual([
      { count: 1, label: "role" },
      { count: 1, label: "education" },
      { count: 1, label: "skill" },
    ]);
    expect(resumeParsedCounts({ work_history_count: 3, education_count: 0, skills_count: 12 }).map(({ label }) => label)).toEqual([
      "roles",
      "education entries",
      "skills",
    ]);
  });
});

describe("the parse's unsourced-figures warning", () => {
  it("flags lines only when the check found some", () => {
    expect(parseProvenanceFlags({ provenance: { checked: true, flagged: [FLAG] } })).toEqual([FLAG]);
    expect(parseProvenanceFlags({ provenance: { checked: true, flagged: [] } })).toEqual([]);
    expect(parseProvenanceFlags({ provenance: null })).toEqual([]);
    expect(parseProvenanceFlags({})).toEqual([]);
  });

  it("says how many items, in the singular or plural", () => {
    expect(parseProvenanceHeadline(1)).toBe("1 item contains figures or names not found in your uploaded resume — review your Profile before refining.");
    expect(parseProvenanceHeadline(2)).toBe("2 items contain figures or names not found in your uploaded resume — review your Profile before refining.");
  });

  it("names where each flagged line came from", () => {
    expect(parseProvenancePlace({ kind: "summary", company: "Acme" })).toBe("the summary");
    expect(parseProvenancePlace({ kind: "work_bullet", company: "Acme" })).toBe("Acme");
    expect(parseProvenancePlace({ kind: "work_bullet", company: null })).toBe("a role");
    expect(parseProvenancePlace({ kind: "work_bullet" })).toBe("a role");
  });
});
