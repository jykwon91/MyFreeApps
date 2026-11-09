import { describe, expect, it } from "vitest";
import {
  blankForm,
  fromProperty,
  isBlank,
  propertyChanges,
  propertyFormProblems,
  toAddress,
  toPropertyWrite,
  withClassification,
} from "../utils/propertyForm";
import type { Property } from "../types/property/property";

const property: Property = {
  id: "p1",
  name: "Elm",
  address: "1 Elm St, Austin, TX 78701",
  classification: "investment",
  type: "short_term",
  is_active: true,
  activity_periods: [],
  created_at: "2026-01-01T00:00:00Z",
};

describe("addresses", () => {
  it("round-trips street, city, state and zip", () => {
    const form = fromProperty(property);
    expect(form).toMatchObject({ street: "1 Elm St", city: "Austin", state: "TX", zip: "78701" });
    expect(toAddress(form)).toBe(property.address);
  });
});

describe("withClassification", () => {
  it("defaults an investment to short-term and clears the type otherwise", () => {
    expect(withClassification(blankForm(), "investment").type).toBe("short_term");
    expect(withClassification({ ...blankForm(), type: "long_term" }, "investment").type).toBe("long_term");
    expect(withClassification(fromProperty(property), "primary_residence").type).toBeNull();
  });
});

describe("propertyFormProblems", () => {
  it("requires a name and every address part on create", () => {
    expect(Object.keys(propertyFormProblems(blankForm())).sort()).toEqual(["city", "name", "state", "street", "zip"]);
  });

  it("leaves an unchanged legacy address alone so a rename is not blocked", () => {
    const legacy = { ...property, address: "Unit 5, 1 Elm St, Austin, TX 78701" };
    expect(propertyFormProblems(fromProperty(legacy), legacy)).toEqual({});
    expect(propertyFormProblems({ ...fromProperty(legacy), name: " " }, legacy)).toHaveProperty("name");
  });

  it("checks the address again once it is edited", () => {
    expect(propertyFormProblems({ ...fromProperty(property), zip: "" }, property)).toHaveProperty("zip");
  });
});

describe("toPropertyWrite and isBlank", () => {
  it("includes the type only when there is one", () => {
    expect(toPropertyWrite(fromProperty(property)).type).toBe("short_term");
    expect(toPropertyWrite({ ...fromProperty(property), classification: "primary_residence", type: null })).not.toHaveProperty("type");
  });

  it("calls an untouched form blank", () => {
    expect(isBlank(blankForm())).toBe(true);
    expect(isBlank({ ...blankForm(), name: "x" })).toBe(false);
  });
});

describe("propertyChanges", () => {
  it("is empty when nothing changed", () => {
    expect(propertyChanges(fromProperty(property), property)).toEqual({});
  });

  it("sends only the name when only the name changed", () => {
    expect(propertyChanges({ ...fromProperty(property), name: "Oak" }, property)).toEqual({ name: "Oak" });
  });

  it("sends the address when a part changed", () => {
    expect(propertyChanges({ ...fromProperty(property), city: "Dallas" }, property)).toEqual({ address: "1 Elm St, Dallas, TX 78701" });
  });

  it("sends classification together with type", () => {
    expect(propertyChanges({ ...fromProperty(property), type: "long_term" }, property)).toEqual({ classification: "investment", type: "long_term" });
  });
});
