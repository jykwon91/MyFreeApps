import { createHmac } from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(secret: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const ch of secret.toUpperCase().replace(/=/g, "")) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

const STEP_MS = 30_000;

/** The 30-second TOTP step the clock is in now. */
export function currentTotpStep(): number {
  return Math.floor(Date.now() / STEP_MS);
}

/** Milliseconds until the next TOTP step begins. */
export function msUntilNextTotpStep(): number {
  return STEP_MS - (Date.now() % STEP_MS);
}

/**
 * The SHA-256 code an authenticator app would show during `step`.
 * For E2E tests only. Written out because otplib's SHA-256 codes don't match pyotp's.
 */
export function totpCodeAtStep(secret: string, step: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha256", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000).toString().padStart(6, "0");
}

/** The code an authenticator app would show, `stepsAhead` 30-second steps from now. */
export function totpCode(secret: string, stepsAhead = 0): string {
  return totpCodeAtStep(secret, currentTotpStep() + stepsAhead);
}
