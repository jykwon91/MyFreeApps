import type { CategoryGroupKind } from "./CategoryGroupKind";
import type { CategoryTotal } from "./CategoryTotal";

export interface CategoryGroup {
  kind: CategoryGroupKind;
  heading: string;
  rows: CategoryTotal[];
}
