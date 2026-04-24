import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import Select from "@/shared/components/ui/Select";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MAX_VISIBLE_PAGES = 7;

function buildPageList(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];

  // Always show first page
  pages.push(1);

  const leftEdge = current - 2;
  const rightEdge = current + 2;

  if (leftEdge > 2) {
    pages.push("...");
  }

  const start = Math.max(2, leftEdge);
  const end = Math.min(totalPages - 1, rightEdge);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (rightEdge < totalPages - 1) {
    pages.push("...");
  }

  // Always show last page
  pages.push(totalPages);

  return pages;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: PaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const pageList = buildPageList(page, totalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm",
        className
      )}
    >
      {/* Summary */}
      <span className="text-muted-foreground">
        Showing {firstItem}–{lastItem} of {total}
      </span>

      {/* Page buttons */}
      <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex items-center justify-center w-9 h-9 rounded-md border text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors min-h-[44px] min-w-[44px]"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pageList.map((p, idx) =>
          p === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              className="flex items-center justify-center w-9 h-9 text-muted-foreground"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-md border text-sm transition-colors min-h-[44px] min-w-[44px]",
                p === page
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="flex items-center justify-center w-9 h-9 rounded-md border text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors min-h-[44px] min-w-[44px]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Page size selector */}
      {onPageSizeChange && (
        <div className="flex items-center gap-2">
          <label htmlFor="pagination-page-size" className="text-muted-foreground">
            Rows per page:
          </label>
          <Select
            id="pagination-page-size"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 min-h-[44px]"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={String(opt)}>
                {opt}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
