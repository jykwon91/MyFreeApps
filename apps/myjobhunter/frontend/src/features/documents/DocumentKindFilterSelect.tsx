import type { Ref } from "react";
import type { DocumentKindFilter } from "@myjobhunter/api-client/types/document/document-kind-filter";
import { DOCUMENT_KIND_FILTER_OPTIONS } from "@myjobhunter/api-client/constants/documentKindFilterOptions";
import { DOCUMENTS_LIST_MESSAGES as MESSAGES } from "@/constants/documents-list-messages";

export interface DocumentKindFilterSelectProps {
  value: DocumentKindFilter;
  onChange: (value: DocumentKindFilter) => void;
  /** Lets the list put focus back on the select after Clear filter removes the button that held it. */
  selectRef?: Ref<HTMLSelectElement>;
}

export default function DocumentKindFilterSelect({ value, onChange, selectRef }: DocumentKindFilterSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        ref={selectRef}
        aria-label={MESSAGES.filterLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as DocumentKindFilter)}
        className="min-h-[44px] w-full sm:w-auto text-sm border rounded-md px-3 bg-background"
      >
        {DOCUMENT_KIND_FILTER_OPTIONS.map(({ value: optionValue, label }) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
