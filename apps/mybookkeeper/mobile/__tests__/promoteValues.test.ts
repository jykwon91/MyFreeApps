import { isOldEnough, promoteRequest } from "../src/features/applicants/promoteValues";

const today = new Date(2026, 10, 4);

describe("isOldEnough", () => {
  it("counts from the birthday, not the year", () => {
    expect(isOldEnough("2008-11-04", today)).toBe(true);
    expect(isOldEnough("2008-11-05", today)).toBe(false);
    expect(isOldEnough("2008-12-01", today)).toBe(false);
    expect(isOldEnough("2008-10-31", today)).toBe(true);
  });

  it("refuses a date in the future", () => {
    expect(isOldEnough("2030-01-01", today)).toBe(false);
  });
});

describe("promoteRequest", () => {
  it("sends blanks as nothing, and trims the rest", () => {
    expect(
      promoteRequest({ legalName: "  Dana  ", dob: null, employer: " ", contractStart: null, vehicle: "", smoker: "unknown", pets: "", referredBy: "" }),
    ).toEqual({ legal_name: "Dana", dob: null, employer_or_hospital: null, contract_start: null, vehicle_make_model: null, smoker: null, pets: null, referred_by: null });
  });

  it("tells No from Unknown", () => {
    const base = { legalName: "", dob: null, employer: "", contractStart: null, vehicle: "", pets: "", referredBy: "" };
    expect(promoteRequest({ ...base, smoker: "no" }).smoker).toBe(false);
    expect(promoteRequest({ ...base, smoker: "yes" }).smoker).toBe(true);
  });
});
