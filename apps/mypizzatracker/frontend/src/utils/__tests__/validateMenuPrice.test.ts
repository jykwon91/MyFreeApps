import { describe, it, expect } from "vitest";
import { validateMenuPrice } from "../validateMenuPrice";
import { MENU_PRICE_ERRORS } from "@/constants/menuPrice";

describe("validateMenuPrice", () => {
  it.each(["0", "0.00", "12", "12.5", "12.35", "99999999.99", " 7.00 ", "5."])("accepts %j", (v) => {
    expect(validateMenuPrice(v)).toBeNull();
  });

  it.each([["", "required"], ["  ", "required"], [null, "required"], [undefined, "required"]] as const)(
    "rejects empty %j",
    (v, key) => expect(validateMenuPrice(v)).toBe(MENU_PRICE_ERRORS[key]),
  );

  it.each(["abc", "1e2", "--1", "1.2.3"])("rejects non-numeric %j", (v) => {
    expect(validateMenuPrice(v)).toBe(MENU_PRICE_ERRORS.invalid);
  });

  it.each(["-1", "-0.01"])("rejects negative %j", (v) => {
    expect(validateMenuPrice(v)).toBe(MENU_PRICE_ERRORS.negative);
  });

  it.each(["12.345", "0.001"])("rejects more than 2 decimals %j", (v) => {
    expect(validateMenuPrice(v)).toBe(MENU_PRICE_ERRORS.decimals);
  });

  it("rejects amounts the column cannot hold", () => {
    expect(validateMenuPrice("100000000")).toBe(MENU_PRICE_ERRORS.tooLarge);
  });
});
