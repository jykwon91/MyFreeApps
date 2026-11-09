import { MAX_TAX_RETURN_YEAR, MIN_TAX_RETURN_YEAR } from "../constants/taxReturnYears";

/** Every year a return can be started for, newest first. */
export function taxReturnYearChoices(): number[] {
  return Array.from({ length: MAX_TAX_RETURN_YEAR - MIN_TAX_RETURN_YEAR + 1 }, (_, back) => MAX_TAX_RETURN_YEAR - back);
}
