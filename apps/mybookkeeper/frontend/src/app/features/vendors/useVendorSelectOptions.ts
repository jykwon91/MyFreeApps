import { useVendorsPages } from "@mybookkeeper/api-client/hooks/useVendorsPages";
import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import { pagedListView } from "@/shared/lib/paged-list-view";
import type { VendorSelectOptions } from "@/shared/types/vendor-select-options";

/**
 * Every saved vendor, a page at a time. A vendor already assigned (`selectedId`) who isn't on a loaded page
 * yet is read on its own, so the dropdown still shows their name.
 */
export function useVendorSelectOptions(selectedId: string | null): VendorSelectOptions {
  const pages = useVendorsPages({});
  const { mode, rows } = pagedListView(pages, pages.vendors);
  const isSelectedLoaded = selectedId === null || rows.some((vendor) => vendor.id === selectedId);
  // Asked only once the first page is in, so a vendor on it costs no extra request.
  const { currentData: selected } = useGetVendorByIdQuery(selectedId ?? "", { skip: isSelectedLoaded || mode === "loading" });
  const vendors = !isSelectedLoaded && selected ? [...rows, selected] : rows;
  const options = vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }));
  return { pages, mode, options };
}
