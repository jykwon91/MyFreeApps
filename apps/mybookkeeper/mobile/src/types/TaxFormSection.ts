import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import type { TaxFormInstance } from "@mybookkeeper/api-client/types/tax/TaxFormInstance";

export interface TaxFormSection {
  title: string;
  instance: TaxFormInstance;
  data: TaxFormField[];
}
