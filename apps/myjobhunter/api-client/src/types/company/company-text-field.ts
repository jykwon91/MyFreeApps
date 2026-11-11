import type { CompanySortField } from "./company-sort-field";

/** A Company text field a screen shows only when it's set: the list's columns, plus the size range. */
export type CompanyTextField = CompanySortField | "size_range";
