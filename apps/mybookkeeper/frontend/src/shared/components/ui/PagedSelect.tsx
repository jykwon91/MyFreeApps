import type { ComponentPropsWithRef, ReactNode } from "react";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import type { PagedSelectStatus } from "@/shared/types/paged-select-status";
import type { SelectOption } from "@/shared/types/ui/select-option";

export interface PagedSelectProps extends Omit<ComponentPropsWithRef<"select">, "children"> {
  /** The first option, which stands for nothing chosen. */
  emptyLabel: string;
  options: readonly SelectOption[];
  /** The paging hook's state the options came from. */
  pages: PagedSelectStatus;
  /** What the options are, plural ("tenants"), for the error message. */
  noun: string;
  /** Shown on the select's row, after it (a button that acts on the choice). */
  aside?: ReactNode;
}

/**
 * A dropdown over a paged list, every row of it: more load a page at a time with Load more under it, and a
 * failure shows an alert with Retry. Pass the select's own props (`id`, `value`, `onChange`, a form
 * `register` spread) straight through.
 */
export default function PagedSelect({ emptyLabel, options, pages, noun, aside, ...selectProps }: PagedSelectProps) {
  const select = (
    <select {...selectProps}>
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-2 flex-1">
      {aside ? (
        <div className="flex items-center gap-2 flex-wrap">
          {select}
          {aside}
        </div>
      ) : (
        select
      )}
      <ListPagesErrorAlert pages={pages} noun={noun} />
      <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
    </div>
  );
}
