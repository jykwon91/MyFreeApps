import type { AuthFormFailure } from "./AuthFormFailure";

export type RegisterFailure = AuthFormFailure | "email_taken";
