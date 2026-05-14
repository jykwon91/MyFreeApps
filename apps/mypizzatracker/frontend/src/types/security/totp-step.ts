// Wizard state for the Two-Factor enrollment / disable flow rendered in
// `features/security/TwoFactorSetup.tsx`. One file per type per project rules.
export type Step = "status" | "verify" | "recovery" | "disable";
