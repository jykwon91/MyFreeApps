import { describe, expect, it } from "vitest";
import { ROLE_TITLE_MAX_LENGTH } from "../constants/addApplicationForm";
import { APPLICATION_NOTES_MAX_LENGTH } from "../constants/textFieldLimits";
import type { Company } from "../types/company";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import type { JdParseResponse } from "../types/application/jd-parse-response";
import type { JdUrlExtractResponse } from "../types/application/jd-url-extract-response";
import { addApplicationFormProblems } from "../utils/addApplicationFormProblems";
import { buildApplicationCreateRequest } from "../utils/buildApplicationCreateRequest";
import { combineNotes } from "../utils/combineNotes";
import { filterCompanies } from "../utils/filterCompanies";
import { findCompanyByName } from "../utils/findCompanyByName";
import { htmlToPlainText } from "../utils/htmlToPlainText";
import { isJobPostingUrl } from "../utils/isJobPostingUrl";
import { prefillFromExtract } from "../utils/prefillFromExtract";
import { prefillFromParse } from "../utils/prefillFromParse";
import { readCompanyId } from "../utils/readCompanyId";
import { resolveExtractedCompany } from "../utils/resolveExtractedCompany";
import { websiteToDomain } from "../utils/websiteToDomain";
import type { UrlHostname } from "../types/application/url-hostname";

function company(overrides: Partial<Company> & Pick<Company, "id" | "name">): Company {
  return {
    user_id: "u1",
    primary_domain: null,
    logo_url: null,
    industry: null,
    size_range: null,
    hq_location: null,
    description: null,
    external_ref: null,
    external_source: null,
    crunchbase_id: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const ACME = company({ id: "c-acme", name: "Acme", primary_domain: "acme.io" });
const GLOBEX = company({ id: "c-globex", name: "Globex Corp" });

/** Stands in for a platform's parser: drops tags, so these tests pin only the shared folding. */
const dropTags = (html: string) => html.replace(/<[^>]*>/g, "");

const EXTRACT: JdUrlExtractResponse = {
  title: null,
  company: null,
  company_website: null,
  company_logo_url: null,
  location: null,
  description_html: null,
  requirements_text: null,
  summary: null,
  source_url: "https://jobs.example.com/1",
};

const PARSE: JdParseResponse = {
  title: null,
  company: null,
  location: null,
  remote_type: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  seniority: null,
  must_have_requirements: [],
  nice_to_have_requirements: [],
  responsibilities: [],
  summary: null,
};

const VALUES: AddApplicationFormValues = { role_title: "Engineer", location: "", remote_type: "unknown", notes: "" };

describe("findCompanyByName", () => {
  it("matches ignoring case and surrounding spaces", () => {
    expect(findCompanyByName([ACME, GLOBEX], "  acme ")).toBe(ACME);
    expect(findCompanyByName([ACME, GLOBEX], "Globex")).toBeUndefined();
  });
});

describe("filterCompanies", () => {
  it("matches the name or the domain, ignoring case, and keeps everything for no query", () => {
    expect(filterCompanies([ACME, GLOBEX], "GLOB")).toEqual([GLOBEX]);
    expect(filterCompanies([ACME, GLOBEX], ".io")).toEqual([ACME]);
    expect(filterCompanies([ACME, GLOBEX], "  ")).toEqual([ACME, GLOBEX]);
  });
});

/** The website's parser: the browser's own URL. */
const browserHostname: UrlHostname = (url) => new URL(url).hostname;

describe("websiteToDomain", () => {
  it("keeps only the host of a URL, lower-cased and without www.", () => {
    expect(websiteToDomain("https://WWW.Acme.com:8080/careers?x=1#top", browserHostname)).toBe("acme.com");
    expect(websiteToDomain("https://pivotalhealth.example/", browserHostname)).toBe("pivotalhealth.example");
    expect(websiteToDomain("http://user@acme.com", browserHostname)).toBe("acme.com");
  });

  it("keeps an internationalised domain in its punycode form, as the URL parser gives it", () => {
    expect(websiteToDomain("https://www.Bücher.de/jobs", browserHostname)).toBe("xn--bcher-kva.de");
  });

  it("only trims a scheme, trailing slash and www. from something that isn't a URL", () => {
    expect(websiteToDomain("www.Acme.com/", browserHostname)).toBe("Acme.com");
    expect(websiteToDomain("https://", browserHostname)).toBeNull();
    expect(websiteToDomain("", browserHostname)).toBeNull();
    expect(websiteToDomain(null, browserHostname)).toBeNull();
  });
});

describe("resolveExtractedCompany", () => {
  it("uses a tracked company with the same name", () => {
    expect(resolveExtractedCompany([ACME], "ACME", browserHostname, { website: "https://other.com" })).toEqual({ kind: "existing", company: ACME });
  });

  it("adds a new one with the domain and logo the posting gave", () => {
    expect(resolveExtractedCompany([ACME], " Initech ", browserHostname, { website: "https://www.initech.com/", logoUrl: "https://cdn/logo.png" })).toEqual({
      kind: "create",
      request: { name: "Initech", primary_domain: "initech.com", logo_url: "https://cdn/logo.png" },
    });
    expect(resolveExtractedCompany([], "Initech", browserHostname)).toEqual({ kind: "create", request: { name: "Initech" } });
  });

  it("has nothing to do without a name", () => {
    expect(resolveExtractedCompany([ACME], "  ", browserHostname)).toEqual({ kind: "none" });
    expect(resolveExtractedCompany([ACME], null, browserHostname)).toEqual({ kind: "none" });
  });
});

describe("readCompanyId", () => {
  it("is the company's id, or null when adding it failed", () => {
    expect(readCompanyId({ kind: "tracked", companyId: "a", name: "A", logoUrl: null })).toBe("a");
    expect(readCompanyId({ kind: "new", companyId: "b", name: "B", logoUrl: null })).toBe("b");
    expect(readCompanyId({ kind: "manual", companyId: null, name: "C", logoUrl: null })).toBeNull();
    expect(readCompanyId({ kind: "autoCreateFailed", name: "D" })).toBeNull();
  });
});

describe("htmlToPlainText", () => {
  it("breaks lines at block markup, folds non-breaking spaces and long runs of blank lines", () => {
    expect(htmlToPlainText("one<br>two<p>three</p>", dropTags)).toBe("one\ntwo\nthree");
    expect(htmlToPlainText("a<br><br><br><br>b", dropTags)).toBe("a\n\nb");
    expect(htmlToPlainText("Ben\u00a0& Jerry", dropTags)).toBe("Ben & Jerry");
  });
});

describe("combineNotes", () => {
  it("joins summary, description and requirements, and is null when there are none", () => {
    expect(combineNotes(EXTRACT, dropTags)).toBeNull();
    expect(combineNotes({ ...EXTRACT, summary: "Sum", description_html: "<p>Desc</p>", requirements_text: "Reqs" }, dropTags)).toBe(
      "Sum\n\nDesc\n\nReqs",
    );
    expect(combineNotes({ ...EXTRACT, description_html: "<div> </div>" }, dropTags)).toBeNull();
  });

  it("stops at the notes limit", () => {
    expect(combineNotes({ ...EXTRACT, summary: "x".repeat(APPLICATION_NOTES_MAX_LENGTH + 10) }, dropTags)).toHaveLength(APPLICATION_NOTES_MAX_LENGTH);
  });
});

describe("prefillFromParse", () => {
  it("fills what was found, and a remote type only when the posting says one", () => {
    expect(prefillFromParse({ ...PARSE, title: "Eng", location: "SF", remote_type: "hybrid" })).toEqual({
      role_title: "Eng",
      location: "SF",
      remote_type: "hybrid",
    });
    expect(prefillFromParse({ ...PARSE, remote_type: "unknown" })).toEqual({});
    expect(prefillFromParse({ ...PARSE, remote_type: "on the moon" })).toEqual({});
  });
});

describe("prefillFromExtract", () => {
  it("fills the title, location and the notes scaffold", () => {
    expect(prefillFromExtract({ ...EXTRACT, title: "Eng", location: "NYC", summary: "Sum" }, dropTags)).toEqual({
      role_title: "Eng",
      location: "NYC",
      notes: "Sum",
    });
    expect(prefillFromExtract(EXTRACT, dropTags)).toEqual({});
  });
});

describe("addApplicationFormProblems", () => {
  it("needs a role title, and keeps each field within the backend's limits", () => {
    expect(addApplicationFormProblems(VALUES)).toEqual({});
    expect(addApplicationFormProblems({ ...VALUES, role_title: "   " }).role_title).toBe("Role title is required");
    const tooLong = addApplicationFormProblems({
      ...VALUES,
      role_title: "x".repeat(ROLE_TITLE_MAX_LENGTH + 1),
      location: "x".repeat(201),
      notes: "x".repeat(APPLICATION_NOTES_MAX_LENGTH + 1),
    });
    expect(Object.keys(tooLong).sort()).toEqual(["location", "notes", "role_title"]);
  });
});

describe("buildApplicationCreateRequest", () => {
  it("trims what's typed and sends blanks as null", () => {
    expect(
      buildApplicationCreateRequest(
        { role_title: " Eng ", location: " ", remote_type: "remote", notes: " Note " },
        { companyId: "c1", sourceUrl: "https://jobs.example.com/1", jdText: "  " },
      ),
    ).toEqual({
      company_id: "c1",
      role_title: "Eng",
      url: "https://jobs.example.com/1",
      location: null,
      remote_type: "remote",
      notes: "Note",
      jd_text: null,
    });
  });
});

describe("isJobPostingUrl", () => {
  it("is true only for a whole http(s) link", () => {
    expect(isJobPostingUrl(" https://jobs.example.com/1 ")).toBe(true);
    expect(isJobPostingUrl("jobs.example.com")).toBe(false);
    expect(isJobPostingUrl("see https://x.com")).toBe(false);
  });
});
