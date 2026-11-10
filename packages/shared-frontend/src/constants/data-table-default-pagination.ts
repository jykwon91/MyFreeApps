import type { PaginationState } from "@tanstack/react-table";

/** TanStack's own default page; DataTable starts here when pagination is uncontrolled. */
export const DATA_TABLE_DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 10 };
