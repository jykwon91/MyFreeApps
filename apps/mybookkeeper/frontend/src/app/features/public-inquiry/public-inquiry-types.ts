import type { EmploymentStatus } from "@/shared/types/inquiry/employment-status";

export interface FormState {
  name: string;
  email: string;
  phone: string;
  moveInDate: string;
  moveOutDate: string;
  occupantCount: string;
  hasPets: string; // "" | "yes" | "no"
  petsDescription: string;
  vehicleCount: string;
  currentCity: string;
  currentCountry: string; // ISO 3166-1 alpha-2
  currentRegion: string; // 2-letter US state code OR free-text region
  employmentStatus: EmploymentStatus | "";
  whyThisRoom: string;
  additionalNotes: string;
  website: string; // honeypot
}

export type ValidatedField =
  | "name"
  | "email"
  | "phone"
  | "moveInDate"
  | "moveOutDate"
  | "occupantCount"
  | "hasPets"
  | "currentCity"
  | "currentCountry"
  | "currentRegion"
  | "employmentStatus"
  | "whyThisRoom";

export type FieldErrors = Partial<Record<ValidatedField, string>>;
export type TouchedFields = Partial<Record<ValidatedField, boolean>>;
