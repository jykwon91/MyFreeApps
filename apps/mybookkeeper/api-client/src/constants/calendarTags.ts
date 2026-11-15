// The calendar shows leases (dates, listing, tenant name) and listing blackouts,
// so any write to those must refetch every open calendar window.
export const CALENDAR_LIST_TAG = { type: "Calendar" as const, id: "LIST" as const };
