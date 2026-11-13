import { describe, expect, it } from "vitest";
import { INQUIRY_FIELD_MAX_LENGTH, INQUIRY_FORM_PROBLEMS } from "../constants/inquiryForm";
import type { InquiryFormValues } from "../types/inquiry/inquiry-form-values";
import {
  blankInquiryForm,
  externalInquiryIdLabel,
  inquiryFormProblems,
  inquiryFormToCreateRequest,
  needsExternalInquiryId,
  receivedAtValue,
} from "../utils/inquiryForm";

function aForm(overrides: Partial<InquiryFormValues> = {}): InquiryFormValues {
  return { ...blankInquiryForm(new Date(2026, 10, 13, 9, 5)), inquirer_name: "Dana Reed", ...overrides };
}

describe("blankInquiryForm", () => {
  it("opens as a direct inquiry received now, in local time", () => {
    const blank = blankInquiryForm(new Date(2026, 10, 13, 9, 5));
    expect(blank.source).toBe("direct");
    expect(blank.received_at).toBe("2026-11-13T09:05");
    expect(blank.inquirer_name).toBe("");
    expect(blank.listing_id).toBe("");
  });

  it("formats any date the same way", () => {
    expect(receivedAtValue(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02T23:59");
  });
});

describe("external inquiry ID", () => {
  it("is needed for every source but direct", () => {
    expect(needsExternalInquiryId("direct")).toBe(false);
    expect(needsExternalInquiryId("FF")).toBe(true);
    expect(needsExternalInquiryId("TNH")).toBe(true);
    expect(needsExternalInquiryId("other")).toBe(true);
    expect(needsExternalInquiryId("public_form")).toBe(true);
  });

  it("is labelled after the platform", () => {
    expect(externalInquiryIdLabel("FF")).toBe("Furnished Finder inquiry ID");
  });
});

describe("inquiryFormProblems", () => {
  it("has none for a filled-in direct inquiry", () => {
    expect(inquiryFormProblems(aForm())).toEqual({});
  });

  it("asks for a name, ignoring spaces", () => {
    expect(inquiryFormProblems(aForm({ inquirer_name: "   " }))).toEqual({ inquirer_name: INQUIRY_FORM_PROBLEMS.nameRequired });
  });

  it("asks for the platform's ID when the source isn't direct", () => {
    expect(inquiryFormProblems(aForm({ source: "FF" }))).toEqual({ external_inquiry_id: INQUIRY_FORM_PROBLEMS.externalIdRequired });
    expect(inquiryFormProblems(aForm({ source: "FF", external_inquiry_id: " " })).external_inquiry_id).toBe(INQUIRY_FORM_PROBLEMS.externalIdRequired);
    expect(inquiryFormProblems(aForm({ source: "FF", external_inquiry_id: "I-1" }))).toEqual({});
  });

  it("refuses an end date before the start, but allows the same day or one date alone", () => {
    expect(inquiryFormProblems(aForm({ desired_start_date: "2026-08-01", desired_end_date: "2026-06-01" }))).toEqual({
      desired_end_date: INQUIRY_FORM_PROBLEMS.endBeforeStart,
    });
    expect(inquiryFormProblems(aForm({ desired_start_date: "2026-08-01", desired_end_date: "2026-08-01" }))).toEqual({});
    expect(inquiryFormProblems(aForm({ desired_end_date: "2026-06-01" }))).toEqual({});
  });

  it("needs a received-at it can read", () => {
    expect(inquiryFormProblems(aForm({ received_at: "" })).received_at).toBe(INQUIRY_FORM_PROBLEMS.receivedAtRequired);
    expect(inquiryFormProblems(aForm({ received_at: "not a date" })).received_at).toBe(INQUIRY_FORM_PROBLEMS.receivedAtRequired);
  });
});

describe("inquiryFormToCreateRequest", () => {
  it("trims, sends blanks as null, and reads received-at as local time", () => {
    const request = inquiryFormToCreateRequest(
      aForm({ inquirer_name: "  Dana Reed ", inquirer_email: " dana@example.com ", notes: "  ", desired_start_date: "2026-12-01" }),
    );
    expect(request).toEqual({
      source: "direct",
      external_inquiry_id: null,
      listing_id: null,
      inquirer_name: "Dana Reed",
      inquirer_email: "dana@example.com",
      inquirer_phone: null,
      inquirer_employer: null,
      desired_start_date: "2026-12-01",
      desired_end_date: null,
      notes: null,
      received_at: new Date(2026, 10, 13, 9, 5).toISOString(),
    });
  });

  it("sends the platform ID and listing when they apply", () => {
    const request = inquiryFormToCreateRequest(aForm({ source: "TNH", external_inquiry_id: " T-9 ", listing_id: "l1" }));
    expect(request.external_inquiry_id).toBe("T-9");
    expect(request.listing_id).toBe("l1");
  });

  it("drops an ID typed before switching back to direct", () => {
    expect(inquiryFormToCreateRequest(aForm({ external_inquiry_id: "I-1" })).external_inquiry_id).toBeNull();
  });

  it("refuses a received-at it can't read", () => {
    expect(() => inquiryFormToCreateRequest(aForm({ received_at: "" }))).toThrow();
  });
});

describe("INQUIRY_FIELD_MAX_LENGTH", () => {
  it("matches the backend's InquiryCreateRequest caps", () => {
    expect(INQUIRY_FIELD_MAX_LENGTH).toEqual({ externalId: 100, name: 255, email: 255, phone: 50, employer: 255, notes: 5000 });
  });
});
