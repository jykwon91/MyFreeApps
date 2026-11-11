import { describe, expect, it } from "vitest";
import type { Company } from "../types/company";
import type { CompanySortField } from "../types/company/company-sort-field";
import { companyFieldText } from "../utils/companyFieldText";
import { compareCompanyText } from "../utils/compareCompanyText";
import { sortCompanies } from "../utils/sortCompanies";

function company(id: string, name: string, primaryDomain: string | null, industry: string | null, hqLocation: string | null): Company {
  return {
    id,
    user_id: "u1",
    name,
    primary_domain: primaryDomain,
    logo_url: null,
    industry,
    size_range: null,
    hq_location: hqLocation,
    description: null,
    external_ref: null,
    external_source: null,
    crunchbase_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

// The server's order (name A to Z). Each is missing something; Umbrella's domain is blank, Hooli's industry only spaces.
const ACME = company("c1", "Acme Corp", "acme.com", "SaaS", "Chicago, IL");
const GLOBEX = company("c2", "Globex", null, null, "Austin, TX");
const HOOLI = company("c5", "Hooli", "hooli.xyz", "   ", null);
const INITECH = company("c3", "Initech", "initech.com", "Fintech", null);
const UMBRELLA = company("c4", "Umbrella", "", "Biotech", "Boston, MA");
const SERVER_ORDER = [ACME, GLOBEX, HOOLI, INITECH, UMBRELLA];

function names(field: CompanySortField, order: "asc" | "desc"): string[] {
  return sortCompanies(SERVER_ORDER, { field, order }).map(({ name }) => name);
}

describe("companyFieldText", () => {
  it("gives the value a company has", () => {
    expect(companyFieldText(ACME, "primary_domain")).toBe("acme.com");
    expect(companyFieldText(ACME, "name")).toBe("Acme Corp");
  });

  it("treats null, empty and only-spaces values as missing", () => {
    expect(companyFieldText(GLOBEX, "primary_domain")).toBeUndefined();
    expect(companyFieldText(UMBRELLA, "primary_domain")).toBeUndefined();
    expect(companyFieldText(HOOLI, "industry")).toBeUndefined();
  });
});

describe("compareCompanyText", () => {
  it("ignores case and accents, and orders numbers by value", () => {
    expect(compareCompanyText("acme", "ACME")).toBe(0);
    expect(compareCompanyText("Éclair", "eclair")).toBe(0);
    expect(compareCompanyText("Éclair", "beta")).toBeGreaterThan(0);
    expect(compareCompanyText("Éclair", "Studio")).toBeLessThan(0);
    expect(compareCompanyText("beta", "Acme")).toBeGreaterThan(0);
    expect(compareCompanyText("Studio 9", "Studio 10")).toBeLessThan(0);
  });
});

describe("sortCompanies", () => {
  it("sorts by name both ways", () => {
    expect(names("name", "asc")).toEqual(["Acme Corp", "Globex", "Hooli", "Initech", "Umbrella"]);
    expect(names("name", "desc")).toEqual(["Umbrella", "Initech", "Hooli", "Globex", "Acme Corp"]);
  });

  it("keeps companies with no domain (null or blank) last, both ways, in the order they came", () => {
    expect(names("primary_domain", "asc")).toEqual(["Acme Corp", "Hooli", "Initech", "Globex", "Umbrella"]);
    expect(names("primary_domain", "desc")).toEqual(["Initech", "Hooli", "Acme Corp", "Globex", "Umbrella"]);
  });

  it("keeps companies with no industry last, both ways", () => {
    expect(names("industry", "asc")).toEqual(["Umbrella", "Initech", "Acme Corp", "Globex", "Hooli"]);
    expect(names("industry", "desc")).toEqual(["Acme Corp", "Initech", "Umbrella", "Globex", "Hooli"]);
  });

  it("keeps companies with no HQ last, both ways", () => {
    expect(names("hq_location", "asc")).toEqual(["Globex", "Umbrella", "Acme Corp", "Hooli", "Initech"]);
    expect(names("hq_location", "desc")).toEqual(["Acme Corp", "Umbrella", "Globex", "Hooli", "Initech"]);
  });

  it("puts accented names among their unaccented letters, the same on every device", () => {
    const given = [company("a", "Studio 10", null, null, null), company("b", "Éclair", null, null, null), company("c", "beta", null, null, null), company("d", "Studio 9", null, null, null), company("e", "Delta", null, null, null), company("f", "Fable", null, null, null)];
    expect(sortCompanies(given, { field: "name", order: "asc" }).map(({ name }) => name)).toEqual(["beta", "Delta", "Éclair", "Fable", "Studio 9", "Studio 10"]);
  });

  it("keeps ties in the order they came, and leaves the list it was given alone", () => {
    const twin = company("c9", "acme corp", null, null, null);
    const given = [twin, ACME];
    expect(sortCompanies(given, { field: "name", order: "asc" })).toEqual([twin, ACME]);
    expect(sortCompanies(given, { field: "name", order: "desc" })).toEqual([twin, ACME]);
    expect(given).toEqual([twin, ACME]);
  });
});
