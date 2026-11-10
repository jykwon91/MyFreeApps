/** A column GET /applications can sort on (`?sort=`). The server owns the order, including status pipeline order. */
export type ApplicationSortField = "applied" | "company" | "role" | "status" | "location" | "remote" | "fit";
