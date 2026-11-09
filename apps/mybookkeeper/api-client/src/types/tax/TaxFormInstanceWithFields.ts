import type { TaxFormField } from "./TaxFormField";
import type { TaxFormInstance } from "./TaxFormInstance";

export type TaxFormInstanceWithFields = TaxFormInstance & { fields: TaxFormField[] };
