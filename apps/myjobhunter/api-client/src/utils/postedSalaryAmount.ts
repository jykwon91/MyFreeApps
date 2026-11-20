import { localeDecimalSeparator } from "@platform/core/utils/localeDecimalSeparator";
import { normalizeDecimalText } from "@platform/core/utils/normalizeDecimalText";
import { POSTED_SALARY_DECIMALS } from "../constants/addApplicationForm";

/**
 * A typed posted-salary amount as the canonical "120000.50" the server reads: "" when blank,
 * undefined when it can't be read (a sign, letters, grouping marks, a fraction of a cent).
 */
export function postedSalaryAmount(text: string): string | undefined {
  return normalizeDecimalText(text, localeDecimalSeparator(), { maxDecimals: POSTED_SALARY_DECIMALS });
}
