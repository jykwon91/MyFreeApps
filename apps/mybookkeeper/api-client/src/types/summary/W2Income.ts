export interface W2Income {
  employer: string | null;
  ein: string | null;
  wages: number;
  federal_withheld: number;
  social_security_wages: number;
  social_security_withheld: number;
  medicare_wages: number;
  medicare_withheld: number;
  state_wages: number;
  state_withheld: number;
}
