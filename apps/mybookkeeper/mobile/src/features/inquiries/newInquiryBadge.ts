import { MAX_NEW_INQUIRY_BADGE } from "../../constants/inquiries";

export function newInquiryBadge(count: number): number | string | undefined {
  if (count <= 0) return undefined;
  return count > MAX_NEW_INQUIRY_BADGE ? `${MAX_NEW_INQUIRY_BADGE}+` : count;
}

export function peopleTabLabel(count: number): string {
  if (count <= 0) return "People";
  if (count > MAX_NEW_INQUIRY_BADGE) return `People, more than ${MAX_NEW_INQUIRY_BADGE} new inquiries`;
  return `People, ${count} new ${count === 1 ? "inquiry" : "inquiries"}`;
}
