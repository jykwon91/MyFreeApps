import type { DocumentKindFilterOption } from "../types/document/document-kind-filter-option";
import { DOCUMENT_KIND_OPTIONS } from "./documentKindOptions";

/** The Documents list's type filter: every type first, then each kind in the order they're offered. */
export const DOCUMENT_KIND_FILTER_OPTIONS: readonly DocumentKindFilterOption[] = [
  { value: "all", label: "All types" },
  ...DOCUMENT_KIND_OPTIONS,
];
