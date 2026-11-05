/**
 * Screens that open from a tap. A fast double tap pushes twice, and Back then
 * appears to do nothing, so each of these keeps one copy per id in the stack.
 */
export const SINGLE_COPY_SCREENS = [
  "ai-permission",
  "applicants/[id]",
  "calendar/index",
  "camera",
  "delete-account",
  "documents/[id]",
  "welcome-manuals/[id]",
  "welcome-manuals/index",
  "utility-plans/[id]",
  "utility-plans/index",
  "mortgages/[id]",
  "mortgages/index",
  "insurance/[id]",
  "insurance/index",
  "inquiries/[id]/index",
  "inquiries/[id]/promote",
  "inquiries/[id]/reply",
  "leases/[id]",
  "leases/index",
  "listings/[id]",
  "listings/index",
  "properties/index",
  "vendors/[id]",
  "vendors/index",
  "transactions/[id]/edit",
  "transactions/[id]/index",
] as const;
