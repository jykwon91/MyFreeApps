import type { PeopleSection } from "../types/PeopleSection";

export const PEOPLE_SECTIONS: readonly { value: PeopleSection; label: string }[] = [
  { value: "inquiries", label: "Inquiries" },
  { value: "applicants", label: "Applicants" },
];
