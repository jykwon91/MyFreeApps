import { signedInEmail as signedInEmailOf } from "@platform/mobile";
import { session } from "./session";

export function signedInEmail(): string | null {
  return signedInEmailOf(session);
}
