import type { TAX_YEAR_CHOICE } from "../../constants/taxYearChange";

export type TaxYearChoice = (typeof TAX_YEAR_CHOICE)[keyof typeof TAX_YEAR_CHOICE];
