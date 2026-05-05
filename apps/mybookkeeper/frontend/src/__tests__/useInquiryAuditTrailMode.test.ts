import { describe, it, expect } from "vitest";
import { useInquiryAuditTrailMode } from "@/app/features/inquiries/useInquiryAuditTrailMode";
import type { InquirySpamAssessment } from "@/shared/types/inquiry/inquiry-spam-assessment";

const ASSESSMENT: InquirySpamAssessment = {
  id: "a-1",
  inquiry_id: "inq-1",
  assessment_type: "claude_score",
  passed: true,
  score: 95,
  flags: null,
  details_json: null,
  created_at: "2026-05-04T10:00:00Z",
};

describe("useInquiryAuditTrailMode", () => {
  it("returns 'collapsed' when not expanded, regardless of loading state", () => {
    expect(
      useInquiryAuditTrailMode({ expanded: false, isLoading: true, assessments: [] }),
    ).toBe("collapsed");
    expect(
      useInquiryAuditTrailMode({ expanded: false, isLoading: false, assessments: [] }),
    ).toBe("collapsed");
    expect(
      useInquiryAuditTrailMode({ expanded: false, isLoading: false, assessments: [ASSESSMENT] }),
    ).toBe("collapsed");
  });

  it("returns 'loading' when expanded and loading", () => {
    expect(
      useInquiryAuditTrailMode({ expanded: true, isLoading: true, assessments: [] }),
    ).toBe("loading");
  });

  it("returns 'empty' when expanded, loaded, and no assessments", () => {
    expect(
      useInquiryAuditTrailMode({ expanded: true, isLoading: false, assessments: [] }),
    ).toBe("empty");
  });

  it("returns 'list' when expanded, loaded, and assessments present", () => {
    expect(
      useInquiryAuditTrailMode({ expanded: true, isLoading: false, assessments: [ASSESSMENT] }),
    ).toBe("list");
  });
});
