import type { TaxCategoryRow } from "./TaxCategoryRow";
import type { TaxPropertyRow } from "./TaxPropertyRow";
import type { TaxW2Row } from "./TaxW2Row";

export type TaxRow = TaxCategoryRow | TaxPropertyRow | TaxW2Row;
