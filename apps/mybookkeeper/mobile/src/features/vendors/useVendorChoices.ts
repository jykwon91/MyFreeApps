import { useVendorsPages } from "@mybookkeeper/api-client/hooks/useVendorsPages";
import { useGetVendorByIdQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import type { VendorsPagesState } from "@mybookkeeper/api-client/types/vendor/vendors-pages-state";
import { useMemo } from "react";
import { pagedChoices } from "../../lib/pagedChoices";
import type { PagedChoices } from "../../types/PagedChoices";

/**
 * Every saved vendor, a page at a time, for the pickers that link one. A vendor already linked (`selectedId`)
 * who isn't on a loaded page yet is read on its own, so its name still shows.
 */
export function useVendorChoices(selectedId: string | null): PagedChoices<VendorsPagesState> {
  const pages = useVendorsPages({});
  const { vendors: loaded } = pages;
  const isSelectedLoaded = selectedId === null || loaded.some((vendor) => vendor.id === selectedId);
  // Asked only once the first page is in, so a vendor on it costs no extra request.
  const { currentData: selected } = useGetVendorByIdQuery(selectedId ?? "", { skip: isSelectedLoaded || pages.isLoading });
  const vendors = useMemo(() => (!isSelectedLoaded && selected ? [...loaded, selected] : loaded), [isSelectedLoaded, selected, loaded]);
  const options = useMemo(() => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })), [vendors]);
  return pagedChoices({ ...pages, vendors }, options);
}
