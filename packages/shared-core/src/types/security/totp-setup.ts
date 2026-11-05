export interface TotpSetup {
  secret: string;
  provisioning_uri: string;
  algorithm: "sha1" | "sha256";
  digits: number;
  period: number;
}
