import { describe, expect, it } from "vitest";
import { CHANNEL_LISTING_FORM_PROBLEMS } from "../constants/channelListingForm";
import { EXTERNAL_ID_FORM_PROBLEMS } from "../constants/externalIdForm";
import type { ChannelListing } from "../types/listing/channel-listing";
import type { ListingExternalId } from "../types/listing/listing-external-id";
import {
  channelListingFormProblems,
  channelListingToCreateRequest,
  channelListingToFormValues,
  channelListingToUpdateRequest,
  emptyChannelListingForm,
  sameChannelListingForm,
} from "../utils/channelListingForm";
import { externalIdChanged, externalIdFormToRequest, externalIdProblem } from "../utils/externalIdForm";

describe("externalIdProblem", () => {
  it("needs an ID or a URL", () => {
    expect(externalIdProblem(" ", "")).toBe(EXTERNAL_ID_FORM_PROBLEMS.needsOne);
  });
  it("accepts an ID alone, and a web address", () => {
    expect(externalIdProblem("12", "")).toBeNull();
    expect(externalIdProblem("", "https://x.example/1")).toBeNull();
  });
  it("rejects a URL that is not http or https", () => {
    expect(externalIdProblem("12", "ftp://x")).toBe(EXTERNAL_ID_FORM_PROBLEMS.urlInvalid);
    expect(externalIdProblem("", "x.example")).toBe(EXTERNAL_ID_FORM_PROBLEMS.urlInvalid);
  });
});

describe("externalIdFormToRequest and externalIdChanged", () => {
  const existing = { external_id: "12", external_url: null } as ListingExternalId;
  it("trims and sends blanks as null", () => {
    expect(externalIdFormToRequest(" 12 ", " ")).toEqual({ external_id: "12", external_url: null });
  });
  it("sees a change only when the sent value differs", () => {
    expect(externalIdChanged(existing, "12", "")).toBe(false);
    expect(externalIdChanged(existing, "", "")).toBe(true);
    expect(externalIdChanged(existing, "12", "https://x.example")).toBe(true);
  });
});

describe("channel listing form", () => {
  const saved = { channel_id: "c1", external_url: "https://a.example/1", external_id: null, ical_import_url: null } as ChannelListing;

  it("starts empty for a channel, and from saved values for an edit", () => {
    expect(emptyChannelListingForm("c1")).toEqual({ channel_id: "c1", external_url: "", external_id: "", ical_import_url: "" });
    expect(channelListingToFormValues(saved)).toEqual({ channel_id: "c1", external_url: "https://a.example/1", external_id: "", ical_import_url: "" });
  });

  it("requires a web address, and a web-address calendar feed when given", () => {
    expect(channelListingFormProblems(emptyChannelListingForm("c1"))).toEqual({ external_url: CHANNEL_LISTING_FORM_PROBLEMS.urlRequired });
    expect(channelListingFormProblems({ ...emptyChannelListingForm("c1"), external_url: "nope", ical_import_url: "nope" })).toEqual({
      external_url: CHANNEL_LISTING_FORM_PROBLEMS.urlInvalid,
      ical_import_url: CHANNEL_LISTING_FORM_PROBLEMS.icalInvalid,
    });
    expect(channelListingFormProblems({ ...emptyChannelListingForm("c1"), external_url: "https://a.example" })).toEqual({});
  });

  it("builds create and update bodies, trimmed, with empty optionals as null", () => {
    const values = { channel_id: "c1", external_url: " https://a.example ", external_id: " ", ical_import_url: " https://a.example/c.ics " };
    expect(channelListingToCreateRequest(values)).toEqual({ channel_id: "c1", external_url: "https://a.example", external_id: null, ical_import_url: "https://a.example/c.ics" });
    expect(channelListingToUpdateRequest(values)).toEqual({ external_url: "https://a.example", external_id: null, ical_import_url: "https://a.example/c.ics" });
  });

  it("compares forms ignoring surrounding spaces", () => {
    const a = channelListingToFormValues(saved);
    expect(sameChannelListingForm(a, { ...a, external_url: " https://a.example/1 " })).toBe(true);
    expect(sameChannelListingForm(a, { ...a, external_id: "9" })).toBe(false);
  });
});
