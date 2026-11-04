import { useEffect, useRef, useState } from "react";
import { SEARCH_DEBOUNCE_MS } from "../../constants/transactionFilters";

/**
 * The search box, kept apart from the address so typing stays instant. The address
 * still wins: a link that changes the vendor changes what the box says.
 */
export function useVendorSearch(vendor: string, onVendorChange: (vendor: string) => void) {
  const [search, setSearch] = useState(vendor);
  const lastKnownVendor = useRef(vendor);
  const pendingChange = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (vendor === lastKnownVendor.current) return;
    lastKnownVendor.current = vendor;
    clearTimeout(pendingChange.current);
    setSearch(vendor);
  }, [vendor]);

  useEffect(() => () => clearTimeout(pendingChange.current), []);

  function changeSearch(next: string): void {
    setSearch(next);
    clearTimeout(pendingChange.current);
    pendingChange.current = setTimeout(() => {
      lastKnownVendor.current = next;
      onVendorChange(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearSearch(): void {
    clearTimeout(pendingChange.current);
    lastKnownVendor.current = "";
    setSearch("");
  }

  return { search, changeSearch, clearSearch };
}
