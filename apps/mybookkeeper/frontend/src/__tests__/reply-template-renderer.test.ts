/**
 * Frontend renderer parity tests.
 *
 * The frontend's local ``renderTemplate`` mirror exists for unit tests only —
 * the live UI calls the backend's ``/render-template`` endpoint. These tests
 * pin the substitution rules to the same behavior as the Python tests so any
 * drift is caught at PR time.
 */
import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/app/features/inquiries/reply-template-renderer";

const BASE = {
  templateSubject: "Re: $listing",
  templateBody: "Hi $name",
  inquirerName: "Alice",
  inquirerEmployer: "Memorial Hermann",
  listingTitle: "Cozy Room",
  listingPetsOnPremises: false,
  listingLargeDogDisclosure: null,
  desiredStartDate: "2026-06-01",
  desiredEndDate: "2026-08-31",
  hostName: "Jason",
  hostPhone: null,
};

describe("renderTemplate (frontend mirror)", () => {
  it("substitutes $name", () => {
    const { body } = renderTemplate({ ...BASE, templateBody: "Hi $name" });
    expect(body).toBe("Hi Alice");
  });

  it("substitutes $listing in subject", () => {
    const { subject } = renderTemplate({ ...BASE, templateSubject: "Re: $listing" });
    expect(subject).toBe("Re: Cozy Room");
  });

  it("formats $dates as 'Mmm D, YYYY to Mmm D, YYYY'", () => {
    const { body } = renderTemplate({ ...BASE, templateBody: "$dates" });
    expect(body).toBe("Jun 1, 2026 to Aug 31, 2026");
  });

  it("falls back to 'there' when name is null", () => {
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "Hi $name",
      inquirerName: null,
    });
    expect(body).toBe("Hi there");
  });

  it("falls back to 'the room' when listing title is null", () => {
    const { subject } = renderTemplate({
      ...BASE,
      templateSubject: "Re: $listing",
      listingTitle: null,
    });
    expect(subject).toBe("Re: the room");
  });

  it("falls back to 'your requested dates' when both dates null", () => {
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "$dates",
      desiredStartDate: null,
      desiredEndDate: null,
    });
    expect(body).toBe("your requested dates");
  });

  it("substitutes $host_name BEFORE $name (longest-key-first)", () => {
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "$name to $host_name",
      inquirerName: "Bob",
      hostName: "Carol",
    });
    expect(body).toBe("Bob to Carol");
  });

  it("auto-prepends large_dog_disclosure when pets_on_premises is true", () => {
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "Hi $name",
      listingPetsOnPremises: true,
      listingLargeDogDisclosure: "There is a 90lb golden retriever",
    });
    expect(body).toBe("There is a 90lb golden retriever\n\nHi Alice");
  });

  it("does NOT prepend disclosure when pets_on_premises is false", () => {
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "Hi $name",
      listingPetsOnPremises: false,
      listingLargeDogDisclosure: "There is a dog",
    });
    expect(body).toBe("Hi Alice");
  });

  it("caps long names at 100 chars", () => {
    const longName = "X".repeat(200);
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "$name",
      inquirerName: longName,
    });
    expect(body.length).toBe(100);
  });

  it("does not interpret HTML in substituted variables", () => {
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "Hi $name",
      inquirerName: "<script>alert(1)</script>",
    });
    // Plain text — angle brackets pass through, no interpretation.
    expect(body).toBe("Hi <script>alert(1)</script>");
  });

  it("leaves unknown variables unchanged", () => {
    const { body } = renderTemplate({
      ...BASE,
      templateBody: "Rate $rate per month",
    });
    expect(body).toBe("Rate $rate per month");
  });
});
