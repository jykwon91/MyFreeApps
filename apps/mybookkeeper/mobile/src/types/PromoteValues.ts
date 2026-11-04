export interface PromoteValues {
  legalName: string;
  dob: string | null;
  employer: string;
  contractStart: string | null;
  vehicle: string;
  smoker: "unknown" | "no" | "yes";
  pets: string;
  referredBy: string;
}
