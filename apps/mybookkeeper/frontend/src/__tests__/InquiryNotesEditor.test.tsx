import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InquiryNotesEditor from "@/app/features/inquiries/InquiryNotesEditor";

vi.mock("@mybookkeeper/api-client/store/inquiriesApi", () => ({
  useUpdateInquiryMutation: () => [vi.fn(), { isLoading: false }],
}));

describe("InquiryNotesEditor", () => {
  it("names the notes field", () => {
    render(<InquiryNotesEditor inquiryId="inq-1" initialNotes="Prefers a quiet unit" />);
    expect(screen.getByRole("textbox", { name: "Inquiry notes" })).toHaveValue("Prefers a quiet unit");
  });
});
