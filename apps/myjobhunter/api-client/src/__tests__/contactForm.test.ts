import { describe, expect, it } from "vitest";
import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LINKEDIN_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_NOTES_MAX_LENGTH,
} from "../constants/contactFieldLimits";
import { CONTACT_ROLE_OPTIONS } from "../constants/contactRoleOptions";
import { EMPTY_CONTACT_FORM_VALUES } from "../constants/emptyContactFormValues";
import type { ContactFormValues } from "../types/contact/contact-form-values";
import { contactCreateRequest } from "../utils/contactCreateRequest";
import { contactFormErrors } from "../utils/contactFormErrors";
import { contactServerErrors } from "../utils/contactServerErrors";
import { hasContactFormErrors } from "../utils/hasContactFormErrors";

const form = (overrides: Partial<ContactFormValues>): ContactFormValues => ({ ...EMPTY_CONTACT_FORM_VALUES, ...overrides });

describe("contactFormErrors", () => {
  it("needs a name or an email, blank space not counting", () => {
    expect(contactFormErrors(EMPTY_CONTACT_FORM_VALUES)).toEqual({ name: "identity_required" });
    expect(contactFormErrors(form({ name: "   ", notes: "met at a meetup" }))).toEqual({ name: "identity_required" });
    expect(contactFormErrors(form({ name: "Sam" }))).toEqual({});
    expect(contactFormErrors(form({ email: "sam@stripe.com" }))).toEqual({});
  });

  it("refuses an email that isn't one plain address, and a profile that isn't http(s)", () => {
    expect(contactFormErrors(form({ email: "sam at stripe" }))).toEqual({ email: "invalid" });
    expect(contactFormErrors(form({ email: "sam@stripe.com?bcc=eve@x.com" }))).toEqual({ email: "invalid" });
    expect(contactFormErrors(form({ name: "Sam", linkedin_url: "javascript:alert(1)" }))).toEqual({ linkedin_url: "invalid" });
    expect(contactFormErrors(form({ name: "Sam", linkedin_url: " https://linkedin.com/in/sam " }))).toEqual({});
  });

  it("holds every field to the backend's length limit, and no further", () => {
    // A valid address of exactly 254: a 64-character local part and 63-character labels.
    const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
    expect(email).toHaveLength(CONTACT_EMAIL_MAX_LENGTH);
    const at = {
      name: "n".repeat(CONTACT_NAME_MAX_LENGTH),
      email,
      linkedin_url: `https://${"l".repeat(CONTACT_LINKEDIN_MAX_LENGTH - "https://".length)}`,
      notes: "o".repeat(CONTACT_NOTES_MAX_LENGTH),
    };
    expect(contactFormErrors(form(at))).toEqual({});
    expect(
      contactFormErrors(
        form({
          name: `${at.name}n`,
          linkedin_url: `${at.linkedin_url}l`,
          notes: `${at.notes}o`,
        }),
      ),
    ).toEqual({ name: "too_long", linkedin_url: "too_long", notes: "too_long" });
    expect(contactFormErrors(form({ email: `${email.slice(0, -4)}x.com` }))).toEqual({ email: "too_long" });
  });

  it("refuses the addresses the backend's EmailStr refuses, and any a mailto could stretch", () => {
    const invalid = [
      "sam..lee@acme.com",
      "sam.@acme.com",
      ".sam@acme.com",
      "sam@acme..com",
      "sam@-acme.com",
      "sam@acme-.com",
      "sam@acme_co.com",
      "sam@acme.123",
      `${"a".repeat(65)}@acme.com`,
      `sam@${"b".repeat(64)}.com`,
      "sam%2Ceve@acme.com",
      "sam@acme",
      "sam@@acme.com",
    ];
    for (const email of invalid) expect(contactFormErrors(form({ email })), email).toEqual({ email: "invalid" });
    for (const email of ["sam+jobs@acme.co", "sam.lee@acme-co.com", "sam@bücher.de", `${"a".repeat(64)}@acme.com`]) {
      expect(contactFormErrors(form({ email })), email).toEqual({});
    }
  });

  it("takes the address out of a pasted Name <address>", () => {
    const named = form({ email: " Sam Lee <sam@acme.com> " });
    expect(contactFormErrors(named)).toEqual({});
    expect(contactCreateRequest(named)).toEqual({ email: "sam@acme.com" });
  });

  it("adds https:// to a profile pasted without a scheme, before checking and sending it", () => {
    for (const [typed, sent] of [
      ["linkedin.com/in/sam", "https://linkedin.com/in/sam"],
      [" www.linkedin.com/in/sam ", "https://www.linkedin.com/in/sam"],
      ["http://linkedin.com/in/sam", "http://linkedin.com/in/sam"],
    ]) {
      const values = form({ name: "Sam", linkedin_url: typed });
      expect(contactFormErrors(values)).toEqual({});
      expect(contactCreateRequest(values).linkedin_url).toBe(sent);
    }
    expect(contactFormErrors(form({ name: "Sam", linkedin_url: "javascript:alert(1)" }))).toEqual({ linkedin_url: "invalid" });
  });
});

describe("contactServerErrors", () => {
  it("puts each 422 problem on the field its loc names", () => {
    const error = {
      status: 422,
      data: {
        detail: [
          { loc: ["body", "email"], msg: "value is not a valid email address: bad domain", type: "value_error" },
          { loc: ["body", "role"], msg: "Value error, role must be one of …", type: "value_error" },
          { loc: ["body", "user_id"], msg: "Extra inputs are not permitted", type: "extra_forbidden" },
          { loc: ["body"], msg: "Value error, At least one of 'name' or 'email' is required.", type: "value_error" },
        ],
      },
    };
    expect(contactServerErrors(error)).toEqual({
      email: "value is not a valid email address: bad domain",
      role: "role must be one of …",
    });
  });

  it("is empty for anything that isn't a field-level 422", () => {
    expect(contactServerErrors({ status: 404, data: { detail: "Application not found" } })).toEqual({});
    expect(contactServerErrors({ status: 422, data: { detail: "nope" } })).toEqual({});
    expect(contactServerErrors(new Error("network"))).toEqual({});
    expect(contactServerErrors(undefined)).toEqual({});
  });
});

describe("hasContactFormErrors", () => {
  it("is true only when something is wrong", () => {
    expect(hasContactFormErrors({})).toBe(false);
    expect(hasContactFormErrors({ email: "invalid" })).toBe(true);
  });
});

describe("contactCreateRequest", () => {
  it("trims what's given and leaves blank fields out", () => {
    expect(contactCreateRequest(form({ name: "  Sam Lee ", email: "", role: "", notes: "  " }))).toEqual({ name: "Sam Lee" });
    expect(
      contactCreateRequest({
        name: "Sam Lee",
        email: " sam@stripe.com ",
        linkedin_url: "https://linkedin.com/in/sam",
        role: "hiring_manager",
        notes: "Prefers email.",
      }),
    ).toEqual({
      name: "Sam Lee",
      email: "sam@stripe.com",
      linkedin_url: "https://linkedin.com/in/sam",
      role: "hiring_manager",
      notes: "Prefers email.",
    });
  });
});

describe("CONTACT_ROLE_OPTIONS", () => {
  it("offers every role the backend accepts, labelled", () => {
    expect(CONTACT_ROLE_OPTIONS.map(({ value }) => value)).toEqual(["recruiter", "hiring_manager", "interviewer", "referrer", "other"]);
    expect(CONTACT_ROLE_OPTIONS[1].label).toBe("Hiring manager");
  });
});
