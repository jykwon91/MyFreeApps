import { describe, expect, it } from "vitest";
import { CONTACT_NAME_MAX_LENGTH, CONTACT_NOTES_MAX_LENGTH } from "../constants/contactFieldLimits";
import { EMPTY_CONTACT_FORM_VALUES } from "../constants/emptyContactFormValues";
import { INTERVIEW_LOCATION_MAX_LENGTH } from "../constants/interviewDetailLimits";
import { APPLICATION_NOTES_MAX_LENGTH, EVENT_NOTE_MAX_LENGTH } from "../constants/textFieldLimits";
import { LOCATION_MAX_LENGTH, ROLE_TITLE_MAX_LENGTH } from "../constants/addApplicationForm";
import type { HtmlTextContent } from "../types/application/html-text-content";
import type { JdUrlExtractResponse } from "../types/application/jd-url-extract-response";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import { emptyFormValues } from "../utils/interviewEventForm";
import { addApplicationFormProblems } from "../utils/addApplicationFormProblems";
import { combineNotes } from "../utils/combineNotes";
import { contactFormErrors } from "../utils/contactFormErrors";
import { eventTextProblems } from "../utils/eventTextProblems";
import { textLength } from "@platform/core/utils/textLength";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";

// One emoji is two UTF-16 units but one code point, which is how the backend counts.
const EMOJI = "😀";
const EMPTY_ADD_APPLICATION_FORM: AddApplicationFormValues = { role_title: "", location: "", remote_type: "unknown", notes: "" };

describe("eventTextProblems", () => {
  const values = emptyFormValues();

  it("accepts a note of emoji that fits in code points but not in UTF-16 units", () => {
    const note = EMOJI.repeat(EVENT_NOTE_MAX_LENGTH);
    expect(note.length).toBeGreaterThan(EVENT_NOTE_MAX_LENGTH);
    expect(eventTextProblems({ ...values, note }, false)).toEqual({});
  });

  it("flags a note one code point over, without the count", () => {
    const note = EMOJI.repeat(EVENT_NOTE_MAX_LENGTH + 1);
    expect(eventTextProblems({ ...values, note }, false)).toEqual({
      note: tooLongProblem(note, EVENT_NOTE_MAX_LENGTH),
    });
  });

  it("checks the location only when the interview fields are shown", () => {
    const long = { ...values, interview_location_or_link: "x".repeat(INTERVIEW_LOCATION_MAX_LENGTH + 1) };
    expect(eventTextProblems(long, false)).toEqual({});
    expect(Object.keys(eventTextProblems(long, true))).toEqual(["interview_location_or_link"]);
  });
});

describe("validators count code points", () => {
  it("lets add-application fields of emoji fit the limit and flags one more", () => {
    const fits = { ...EMPTY_ADD_APPLICATION_FORM, role_title: EMOJI.repeat(ROLE_TITLE_MAX_LENGTH), location: EMOJI.repeat(LOCATION_MAX_LENGTH) };
    expect(addApplicationFormProblems(fits)).toEqual({});
    const over = { ...fits, role_title: EMOJI.repeat(ROLE_TITLE_MAX_LENGTH + 1), location: EMOJI.repeat(LOCATION_MAX_LENGTH + 1) };
    expect(Object.keys(addApplicationFormProblems(over)).sort()).toEqual(["location", "role_title"]);
  });

  it("lets contact fields of emoji fit the limit and flags one more", () => {
    const fits = { ...EMPTY_CONTACT_FORM_VALUES, name: EMOJI.repeat(CONTACT_NAME_MAX_LENGTH), notes: EMOJI.repeat(CONTACT_NOTES_MAX_LENGTH) };
    expect(contactFormErrors(fits)).toEqual({});
    const over = { ...fits, name: EMOJI.repeat(CONTACT_NAME_MAX_LENGTH + 1), notes: EMOJI.repeat(CONTACT_NOTES_MAX_LENGTH + 1) };
    expect(contactFormErrors(over)).toEqual({ name: "too_long", notes: "too_long" });
  });

  it("cuts read notes at the limit in code points, never inside an emoji", () => {
    const extracted: JdUrlExtractResponse = {
      title: null,
      company: null,
      company_website: null,
      company_logo_url: null,
      location: null,
      description_html: null,
      requirements_text: null,
      summary: EMOJI.repeat(APPLICATION_NOTES_MAX_LENGTH + 5),
      source_url: "https://example.com/job",
    };
    const textContent: HtmlTextContent = (html) => html;
    const notes = combineNotes(extracted, textContent);
    expect(textLength(notes ?? "")).toBe(APPLICATION_NOTES_MAX_LENGTH);
    expect(notes?.endsWith(EMOJI)).toBe(true);
  });
});
