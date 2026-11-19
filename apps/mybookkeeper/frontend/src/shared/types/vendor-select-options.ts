import type { VendorsPagesState } from "@mybookkeeper/api-client/types/vendor/vendors-pages-state";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { SelectOption } from "@/shared/types/ui/select-option";

/** Every saved vendor, a page at a time, as choices for an "Assign vendor" dropdown. */
export interface VendorSelectOptions {
  pages: VendorsPagesState;
  mode: ListLoadMode;
  options: SelectOption[];
}
