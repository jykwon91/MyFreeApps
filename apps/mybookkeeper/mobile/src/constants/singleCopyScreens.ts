/**
 * Screens that open from a tap. A fast double tap pushes twice, and Back then
 * appears to do nothing, so each of these keeps one copy per id in the stack.
 */
export const SINGLE_COPY_SCREENS = [
  "ai-permission",
  "applicants/[id]",
  "camera",
  "delete-account",
  "documents/[id]",
  "inquiries/[id]/index",
  "inquiries/[id]/promote",
  "inquiries/[id]/reply",
  "leases/[id]",
  "leases/index",
  "transactions/[id]/edit",
  "transactions/[id]/index",
] as const;
