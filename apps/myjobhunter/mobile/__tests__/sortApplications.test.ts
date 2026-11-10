import { APPLICATION_SORT_KEYS, APPLICATION_SORTS } from "../src/constants/applicationSorts";
import { sortApplications } from "../src/utils/sortApplications";
import { applicationRecord } from "../test-support/applicationRecord";

const companies = (rows: ReturnType<typeof applicationRecord>[]) => rows.map((row) => row.company_name);

describe("sortApplications", () => {
  const a = applicationRecord({ id: "a", company_name: "beta", location: "Austin", remote_type: "onsite", latest_status: "offer_received", fit_score: "9", applied_at: "2026-01-02T00:00:00Z" });
  const b = applicationRecord({ id: "b", company_name: "Alpha", location: "Boston", remote_type: "unknown", latest_status: "applied", fit_score: "10", applied_at: "2026-03-01T00:00:00Z" });
  const c = applicationRecord({ id: "c", company_name: "gamma", location: "", remote_type: "remote", latest_status: null, fit_score: null, applied_at: null });

  it("offers every column both ways", () => {
    expect(new Set(APPLICATION_SORT_KEYS).size).toBe(14);
    expect(Object.keys(APPLICATION_SORTS).sort()).toEqual([...APPLICATION_SORT_KEYS].sort());
  });

  it("compares names without regard to case", () => {
    expect(companies(sortApplications([a, b, c], { field: "company", direction: "asc" }))).toEqual(["Alpha", "beta", "gamma"]);
    expect(companies(sortApplications([a, b, c], { field: "company", direction: "desc" }))).toEqual(["gamma", "beta", "Alpha"]);
  });

  it("compares fit as a number, not as text", () => {
    expect(companies(sortApplications([a, b, c], { field: "fit", direction: "desc" }))).toEqual(["Alpha", "beta", "gamma"]);
  });

  it("puts rows missing the value last in both directions", () => {
    for (const direction of ["asc", "desc"] as const) {
      expect(companies(sortApplications([c, a, b], { field: "location", direction })).at(-1)).toBe("gamma");
      expect(companies(sortApplications([c, a, b], { field: "applied", direction })).at(-1)).toBe("gamma");
      expect(companies(sortApplications([c, a, b], { field: "status", direction })).at(-1)).toBe("gamma");
      // "unknown" is the application not saying.
      expect(companies(sortApplications([b, a, c], { field: "remote", direction })).at(-1)).toBe("Alpha");
    }
  });

  it("orders status by pipeline stage", () => {
    expect(companies(sortApplications([a, b], { field: "status", direction: "asc" }))).toEqual(["Alpha", "beta"]);
  });

  it("leaves the list it was given alone", () => {
    const rows = [a, b, c];
    sortApplications(rows, { field: "company", direction: "desc" });
    expect(rows).toEqual([a, b, c]);
  });
});
