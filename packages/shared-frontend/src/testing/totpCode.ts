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

/**
 * The SHA-256 code an authenticator app would show, `stepsAhead` 30-second steps from now.
 * For E2E tests only. Written out because otplib's SHA-256 codes don't match pyotp's.
 */
export function totpCode(secret: string, stepsAhead = 0): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepsAhead));
  const digest = createHmac("sha256", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000).toString().padStart(6, "0");
}
