export interface TotpSetup {
  secret: string;
  provisioning_uri: string;
  recovery_codes: string[];
}
