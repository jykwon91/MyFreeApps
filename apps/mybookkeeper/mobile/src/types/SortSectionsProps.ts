import type { SortDirection } from "@mybookkeeper/api-client/types/sort/SortDirection";
import type { SortFieldOption } from "@mybookkeeper/api-client/types/sort/SortFieldOption";

export interface SortSectionsProps<Field extends string> {
  fields: readonly SortFieldOption<Field>[];
  field: Field;
  direction: SortDirection;
  onFieldChange: (field: Field) => void;
  onDirectionChange: (direction: SortDirection) => void;
}
